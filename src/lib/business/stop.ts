import { getTaskById, listTasksForEntry, updateTask } from '@/lib/db/queries/tasks'
import { getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { getEntryById } from '@/lib/db/queries/entries'
import { breakToInterval } from '@/lib/business/breaks'
import { splitTaskAcrossMidnights } from '@/lib/business/spans'
import { sqlite } from '@/lib/db'
import type { Task } from '@/types/db'

export type StopTaskResult =
  | { ok: true; task: Task }
  | { ok: false; error: string; status: 400 | 404 | 409 }

/**
 * Stops an active task, upholding every writer invariant in one place:
 *   - rejects an endTime that is not strictly after the task's own start
 *   - clamps the endTime to the earliest obstacle (completed sibling span or
 *     break) so the stopped span never overlaps an existing interval
 *   - splits the stopped span across local midnights so each calendar day keeps
 *     its own segment
 * Shared by the HTTP stop route, close-day, and the MCP tools so no writer can
 * persist an inverted or invariant-breaking row.
 */
export function stopTask(
  taskId: string,
  userId: string,
  timezone: string,
  proposedEndIso?: string
): StopTaskResult {
  const task = getTaskById(taskId)
  if (!task || task.userId !== userId) {
    return { ok: false, error: 'Tarea no encontrada', status: 404 }
  }
  if (task.endTime) {
    return { ok: false, error: 'La tarea ya está detenida', status: 409 }
  }

  let endTime = proposedEndIso ?? new Date().toISOString()

  // Reject a stop time that is not strictly after the task's own start. Without this
  // a caller-supplied endTime earlier than startTime would persist a negative-duration
  // task (the aggregate math clamps it to 0, but the stored row is corrupt).
  const taskStart = new Date(task.startTime).getTime()
  const proposed = new Date(endTime).getTime()
  if (Number.isNaN(proposed) || proposed <= taskStart) {
    return { ok: false, error: 'La hora de fin debe ser posterior a la de inicio', status: 400 }
  }

  // Clamp endTime to the earliest obstacle (existing completed span or break) that
  // starts after the active task's own startTime and before the proposed endTime.
  const obstacles: number[] = []

  // Completed spans that would be overlapped
  const siblings = listTasksForEntry(task.entryId)
  for (const t of siblings) {
    if (t.id === taskId || !t.endTime) continue
    const tStart = new Date(t.startTime).getTime()
    if (tStart > taskStart && tStart < proposed) obstacles.push(tStart)
  }

  // Breaks that would be overlapped
  const entry = getEntryById(task.entryId)
  if (entry) {
    for (const b of getEntryBreaks(task.entryId)) {
      const { startIso } = breakToInterval(b, entry.date)
      const bStart = new Date(startIso).getTime()
      if (bStart > taskStart && bStart < proposed) obstacles.push(bStart)
    }
  }

  if (obstacles.length > 0) {
    endTime = new Date(Math.min(...obstacles)).toISOString()
  }

  // Stop the task, then split it across local midnights so each calendar day keeps
  // its own segment (no-op unless the task spans midnight in the user's timezone).
  sqlite.transaction(() => {
    updateTask(taskId, { endTime })
    splitTaskAcrossMidnights(taskId, userId, timezone)
  })()

  return { ok: true, task: getTaskById(taskId)! }
}
