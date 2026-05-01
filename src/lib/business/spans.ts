import { v4 as uuidv4 } from 'uuid'
import { listTasksForEntry, updateTask, deleteTask, createTask } from '@/lib/db/queries/tasks'
import { getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { breakToInterval, type Interval } from '@/lib/business/breaks'

/**
 * Splits/trims/deletes tasks that overlap with a newly added break interval.
 * No time shifting — the break "carves out" time from existing task spans.
 *
 * Cases handled per overlapping task:
 *   - Task fully inside break        → delete
 *   - Task trimmed at its end        → update endTime = breakStart
 *   - Task trimmed at its start      → update startTime = breakEnd
 *   - Task wraps around break        → trim end + create second span
 */
export function splitTasksAroundBreak(
  entryId: string,
  userId: string,
  breakStartIso: string,
  breakEndIso: string
): { updatedTaskIds: string[]; createdTaskIds: string[]; deletedTaskIds: string[]; deletedDescriptions: string[] } {
  const breakStart = new Date(breakStartIso).getTime()
  const breakEnd = new Date(breakEndIso).getTime()

  const tasks = listTasksForEntry(entryId)
  const updatedTaskIds: string[] = []
  const createdTaskIds: string[] = []
  const deletedTaskIds: string[] = []
  const deletedDescriptions: string[] = []

  for (const task of tasks) {
    if (!task.endTime) continue // skip active task
    const taskStart = new Date(task.startTime).getTime()
    const taskEnd = new Date(task.endTime).getTime()

    // No overlap
    if (taskEnd <= breakStart || taskStart >= breakEnd) continue

    if (taskStart >= breakStart && taskEnd <= breakEnd) {
      // Task fully inside break → delete
      deletedDescriptions.push(task.description)
      deleteTask(task.id)
      deletedTaskIds.push(task.id)
    } else if (taskStart < breakStart && taskEnd <= breakEnd) {
      // Task end falls inside break → trim end
      updateTask(task.id, { endTime: breakStartIso })
      updatedTaskIds.push(task.id)
    } else if (taskStart >= breakStart && taskEnd > breakEnd) {
      // Task start falls inside break → trim start
      updateTask(task.id, { startTime: breakEndIso })
      updatedTaskIds.push(task.id)
    } else {
      // Task wraps around break → trim end, create second span
      updateTask(task.id, { endTime: breakStartIso })
      updatedTaskIds.push(task.id)
      const newTask = createTask({
        id: uuidv4(),
        entryId,
        userId,
        startTime: breakEndIso,
        endTime: task.endTime,
        description: task.description,
        tags: task.tags,
      })
      createdTaskIds.push(newTask.id)
    }
  }

  return { updatedTaskIds, createdTaskIds, deletedTaskIds, deletedDescriptions }
}

/**
 * Called on dashboard page load. If the active task (endTime IS NULL) overlaps
 * one or more breaks that have already started, it is split automatically:
 *   – stops the task at each breakStart
 *   – if the break has already ended, creates a new active task from breakEnd
 *     with the same description and tags
 *
 * Returns true when any split was performed.
 */
export function autoSplitActiveTask(
  entryId: string,
  userId: string,
  entryDate: string
): boolean {
  const now = Date.now()
  const allTasks = listTasksForEntry(entryId)
  let current = allTasks.find((t) => !t.endTime)
  if (!current) return false

  const breaks = getEntryBreaks(entryId)
  const relevantBreaks = breaks
    .map((b) => breakToInterval(b, entryDate))
    .filter(({ startIso }) => {
      const ms = new Date(startIso).getTime()
      return ms > new Date(current!.startTime).getTime() && ms <= now
    })
    .sort((a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime())

  if (relevantBreaks.length === 0) return false

  for (const { startIso, endIso } of relevantBreaks) {
    const { description, tags } = current! // capture before stopping
    updateTask(current!.id, { endTime: startIso })
    current = undefined

    if (new Date(endIso).getTime() <= now) {
      // Break has already ended → resume with a new active task
      current = createTask({ id: uuidv4(), entryId, userId, startTime: endIso, description, tags })
    } else {
      break // break is still ongoing, no new active task yet
    }
  }

  return true
}

/**
 * Called just before creating a new task. If an existing completed task spans
 * across newStartIso, truncates it so its endTime = newStartIso.
 *
 * Returns true if a preceding task was adjusted, false if nothing changed.
 * Does NOT touch breaks — the caller should check for a preceding break
 * separately and reject if one is found.
 */
export function adjustPrecedingTask(entryId: string, newStartIso: string): boolean {
  const newStart = new Date(newStartIso).getTime()

  const tasks = listTasksForEntry(entryId)
  const precedingTask = tasks.find((t) => {
    if (!t.endTime) return false
    return new Date(t.startTime).getTime() < newStart && new Date(t.endTime).getTime() > newStart
  })
  if (precedingTask) {
    updateTask(precedingTask.id, { endTime: newStartIso })
    return true
  }

  // Also close an active task that started before the new span's start
  const activeTask = tasks.find((t) => !t.endTime && new Date(t.startTime).getTime() < newStart)
  if (activeTask) {
    updateTask(activeTask.id, { endTime: newStartIso })
    return true
  }

  return false
}

/**
 * When a break is deleted, extends the task immediately before the break
 * to cover the break's duration. If that extended task is now consecutive
 * with a span of the same description, they are merged into one.
 */
export function extendPreviousTaskOnBreakDelete(
  entryId: string,
  breakStartIso: string,
  breakEndIso: string
): void {
  const breakStart = new Date(breakStartIso).getTime()
  const breakEnd = new Date(breakEndIso).getTime()

  const tasks = listTasksForEntry(entryId) // sorted by startTime
  const completed = tasks.filter((t) => t.endTime)

  // Find task whose endTime is closest to (and ≤) breakStart
  let prevTask: (typeof completed)[0] | undefined
  for (const t of completed) {
    const tEnd = new Date(t.endTime!).getTime()
    if (tEnd <= breakStart) {
      if (!prevTask || tEnd > new Date(prevTask.endTime!).getTime()) {
        prevTask = t
      }
    }
  }

  if (!prevTask) return // nothing before the break, leave gap

  // Extend previous task to cover the break
  updateTask(prevTask.id, { endTime: breakEndIso })

  // Auto-merge: check if the next span (starts at breakEnd) has the same description
  const nextTask = completed.find(
    (t) => t.id !== prevTask!.id && new Date(t.startTime).getTime() === breakEnd
  )
  if (nextTask && nextTask.description === prevTask.description) {
    updateTask(prevTask.id, { endTime: nextTask.endTime })
    deleteTask(nextTask.id)
  }
}

/**
 * Slices [start, end] around a sorted list of break intervals,
 * returning the non-break gaps as {start, end} ms-epoch pairs.
 * Breaks that don't overlap the interval are ignored.
 */
export function splitIntervalAroundBreaks(
  start: number,
  end: number,
  breakIntervals: Interval[]
): { start: number; end: number }[] {
  const overlapping = breakIntervals
    .filter((b) => b.start < end && b.end > start)
    .sort((a, b) => a.start - b.start)

  const segments: { start: number; end: number }[] = []
  let cursor = start

  for (const b of overlapping) {
    if (cursor < b.start) {
      segments.push({ start: cursor, end: b.start })
    }
    cursor = Math.max(cursor, b.end)
  }

  if (cursor < end) {
    segments.push({ start: cursor, end })
  }

  return segments
}

/**
 * When editing a task's time range, trims any other completed tasks that
 * overlap with [newStartIso, newEndIso] to make room for the edit:
 *   - A task whose end falls inside the new range → trim its end to newStart
 *   - A task whose start falls inside the new range → trim its start to newEnd
 *   - A task fully contained inside the new range → deleted
 *
 * Does NOT touch the task being edited (excluded by taskId).
 * Returns IDs of affected tasks.
 */
export function adjustAdjacentTasksForEdit(
  entryId: string,
  taskId: string,
  newStartIso: string,
  newEndIso: string
): { affectedIds: string[]; deletedDescriptions: string[] } {
  const newStart = new Date(newStartIso).getTime()
  const newEnd = new Date(newEndIso).getTime()
  const tasks = listTasksForEntry(entryId)
  const affectedIds: string[] = []
  const deletedDescriptions: string[] = []

  for (const t of tasks) {
    if (t.id === taskId || !t.endTime) continue
    const tStart = new Date(t.startTime).getTime()
    const tEnd = new Date(t.endTime).getTime()
    if (tEnd <= newStart || tStart >= newEnd) continue // no overlap

    if (tStart >= newStart && tEnd <= newEnd) {
      // Fully contained → delete
      deletedDescriptions.push(t.description)
      deleteTask(t.id)
    } else if (tStart < newStart && tEnd <= newEnd) {
      // Tail overlaps → trim end
      updateTask(t.id, { endTime: newStartIso })
    } else if (tStart >= newStart && tEnd > newEnd) {
      // Head overlaps → trim start
      updateTask(t.id, { startTime: newEndIso })
    } else {
      // Wraps around: split it — trim end to newStart, create remainder after newEnd
      updateTask(t.id, { endTime: newStartIso })
      createTask({
        id: uuidv4(),
        entryId,
        userId: t.userId,
        startTime: newEndIso,
        endTime: t.endTime,
        description: t.description,
        tags: t.tags,
        notes: t.notes ?? undefined,
      })
    }
    affectedIds.push(t.id)
  }

  return { affectedIds, deletedDescriptions }
}

/**
 * Fuses spans of the same task that are exactly contiguous (endTime of one === startTime of next).
 * Called after any operation that may leave adjacent same-description spans touching.
 */
export function mergeContiguousSpans(entryId: string): void {
  const tasks = listTasksForEntry(entryId)
  const completed = tasks.filter((t) => t.endTime)

  // Group by description
  const groups = new Map<string, typeof completed>()
  for (const t of completed) {
    if (!groups.has(t.description)) groups.set(t.description, [])
    groups.get(t.description)!.push(t)
  }

  for (const spans of Array.from(groups.values())) {
    if (spans.length < 2) continue
    spans.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

    let i = 0
    while (i < spans.length - 1) {
      const curr = spans[i]
      const next = spans[i + 1]
      if (new Date(curr.endTime!).getTime() === new Date(next.startTime).getTime()) {
        updateTask(curr.id, { endTime: next.endTime })
        deleteTask(next.id)
        spans.splice(i + 1, 1)
      } else {
        i++
      }
    }
  }
}
