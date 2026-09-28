import { v4 as uuidv4 } from 'uuid'
import { sqlite } from '@/lib/db'
import { createTask, deleteTask, getActiveTask, getTaskById, listTasksForEntry, updateTask } from '@/lib/db/queries/tasks'
import { getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { breakToInterval, buildEntryIntervals } from '@/lib/business/breaks'
import {
  adjustAdjacentTasksForEdit,
  splitTasksAroundBreak,
  splitEntryTasksAcrossMidnights,
  mergeContiguousSpans,
} from '@/lib/business/spans'
import { stopTask } from '@/lib/business/stop'
import { WriteConflictError, hasInternalOverlap } from '@/lib/business/overlaps'
import { dateStringInTz } from '@/lib/tz'
import type { Task } from '@/types/db'

export interface CreateTaskCarvingInput {
  entry: { id: string; date: string }
  userId: string
  timezone: string
  description: string
  tags: string[]
  notes?: string | null
  startIso: string
  /** Omit to start an in-progress (active) task. */
  endIso?: string
}

export type CreateTaskCarvingResult =
  | { ok: true; task: Task; deletedDescriptions: string[] }
  | { ok: false; error: string; status: 400 | 409 }

/**
 * Carves the entry's tasks around every break, in chronological order. Clean spans
 * are left untouched (idempotent); a span that crosses a break is trimmed/split, and
 * the active task is closed/resumed around it (see {@link splitTasksAroundBreak}).
 * Returns the descriptions of tasks deleted because a break fully covered them.
 */
function carveEntryAroundBreaks(entry: { id: string; date: string }, userId: string, skipDescriptionOf: string) {
  const deleted: string[] = []
  const breaks = getEntryBreaks(entry.id)
    .map((b) => breakToInterval(b, entry.date))
    .sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime())
  for (const { startIso, endIso } of breaks) {
    const res = splitTasksAroundBreak(entry.id, userId, startIso, endIso)
    res.deletedTaskIds.forEach((id, i) => {
      if (id !== skipDescriptionOf) deleted.push(res.deletedDescriptions[i])
    })
  }
  return deleted
}

/**
 * Creates a task where the new task always wins:
 *   - existing completed tasks it covers are trimmed, split or deleted
 *   - the active task is closed at the new start, deleted if the new task covers
 *     it entirely, or — when a completed task is inserted in the middle of it —
 *     split so it keeps running after the new task's end
 *   - the new task itself is split around breaks (an in-progress task starting
 *     inside or before a break resumes after it)
 * Shared by the HTTP route and the MCP `add_task` tool.
 */
export function createTaskCarving(input: CreateTaskCarvingInput): CreateTaskCarvingResult {
  const { entry, userId, timezone, description, tags, notes, startIso, endIso } = input
  const tStart = new Date(startIso).getTime()
  if (Number.isNaN(tStart)) return { ok: false, error: 'La hora de inicio no es válida', status: 400 }

  if (endIso !== undefined) {
    const tEnd = new Date(endIso).getTime()
    if (Number.isNaN(tEnd) || tEnd <= tStart) {
      return { ok: false, error: 'La hora de fin debe ser posterior a la de inicio', status: 400 }
    }
  }

  // The task must start on the calendar day this entry belongs to — every overlap
  // check downstream is scoped per-entry, so a startTime for a different day would
  // slip past them invisibly. Multi-day spans are still fine (splitEntryTasksAcrossMidnights
  // fans a completed task out across its own day-entries after creation).
  if (dateStringInTz(new Date(startIso), timezone) !== entry.date) {
    return { ok: false, error: 'La hora de inicio no corresponde al día de esta jornada', status: 400 }
  }

  // An open-ended (active) task only makes sense on today's entry — a past day is
  // by definition already over, so it can never legitimately have one running.
  if (endIso === undefined && entry.date !== dateStringInTz(new Date(), timezone)) {
    return {
      ok: false,
      error: 'No se puede dejar una tarea en curso en un día pasado; indica una hora de fin',
      status: 400,
    }
  }

  const tagsJson = JSON.stringify(tags ?? [])
  const deletedDescriptions: string[] = []

  try {
    const task = sqlite.transaction(() => {
      const now = Date.now()
      const active = getActiveTask(userId)
      const activeHere = active && active.entryId === entry.id ? active : undefined

      // An active task left running on another day's entry is simply stopped at the
      // new start (stopTask clamps it to obstacles and splits it across midnights).
      if (active && !activeHere && endIso === undefined) {
        const stopped = stopTask(active.id, userId, timezone, startIso)
        if (!stopped.ok) throw new WriteConflictError(stopped.error, stopped.status === 400 ? 400 : 409)
      }

      let createdId: string

      if (endIso !== undefined) {
        const tEnd = new Date(endIso).getTime()

        // Completed task inserted in the middle of the running one → split the
        // active task: it closes at the new start and keeps running from the new end.
        if (activeHere && new Date(activeHere.startTime).getTime() < tStart && now > tEnd) {
          updateTask(activeHere.id, { endTime: startIso })
          createTask({
            id: uuidv4(),
            entryId: entry.id,
            userId,
            startTime: endIso,
            description: activeHere.description,
            tags: activeHere.tags,
            notes: activeHere.notes ?? undefined,
          })
        }

        // Carve completed siblings (and the remaining active cases) around [start, end].
        const adj = adjustAdjacentTasksForEdit(entry.id, '', startIso, endIso)
        deletedDescriptions.push(...adj.deletedDescriptions)

        createdId = createTask({
          id: uuidv4(),
          entryId: entry.id,
          userId,
          startTime: startIso,
          endTime: endIso,
          description,
          tags: tagsJson,
          notes: notes ?? null,
        }).id
      } else {
        // In-progress task: it covers [start, now]. Resolve the current active task
        // by hand first — adjustAdjacentTasksForEdit reads Date.now() itself and
        // could leave it "pushed" to now, i.e. two active tasks.
        if (activeHere) {
          if (new Date(activeHere.startTime).getTime() >= tStart) {
            deletedDescriptions.push(activeHere.description)
            deleteTask(activeHere.id)
          } else {
            updateTask(activeHere.id, { endTime: startIso })
          }
        }

        const nowIso = new Date(Math.max(now, tStart)).toISOString()
        if (new Date(nowIso).getTime() > tStart) {
          const adj = adjustAdjacentTasksForEdit(entry.id, '', startIso, nowIso)
          deletedDescriptions.push(...adj.deletedDescriptions)
        }

        createdId = createTask({
          id: uuidv4(),
          entryId: entry.id,
          userId,
          startTime: startIso,
          description,
          tags: tagsJson,
          notes: notes ?? null,
        }).id
      }

      // Split the new task (and the active task we closed/split above) around breaks.
      deletedDescriptions.push(...carveEntryAroundBreaks(entry, userId, createdId))
      if (!getTaskById(createdId)) {
        throw new WriteConflictError(
          endIso !== undefined
            ? 'El intervalo cae completamente dentro de una pausa'
            : 'Estás en una pausa; la tarea no puede empezar ahora',
          400
        )
      }

      const created = getTaskById(createdId)!
      splitEntryTasksAcrossMidnights(entry.id, userId, timezone)
      mergeContiguousSpans(entry.id)

      if (hasInternalOverlap(buildEntryIntervals(entry.id, entry.date, { includeActive: true }))) {
        throw new WriteConflictError('El intervalo se solapa con una tarea o pausa existente')
      }

      // Merging may have fused the new task into an earlier same-description span —
      // return whichever span now holds its (possibly break-shifted) start.
      const headStart = new Date(created.startTime).getTime()
      return (
        getTaskById(createdId) ??
        listTasksForEntry(entry.id).find(
          (t) =>
            t.description === description &&
            new Date(t.startTime).getTime() <= headStart &&
            (!t.endTime || new Date(t.endTime).getTime() > headStart)
        ) ??
        created
      )
    })()

    return { ok: true, task, deletedDescriptions }
  } catch (e) {
    if (e instanceof WriteConflictError) return { ok: false, error: e.message, status: e.status }
    throw e
  }
}
