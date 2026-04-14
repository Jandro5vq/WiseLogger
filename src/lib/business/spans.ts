import { v4 as uuidv4 } from 'uuid'
import { listTasksForEntry, updateTask, deleteTask, createTask } from '@/lib/db/queries/tasks'
import { getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { breakToInterval } from '@/lib/business/breaks'

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
): { updatedTaskIds: string[]; createdTaskIds: string[]; deletedTaskIds: string[] } {
  const breakStart = new Date(breakStartIso).getTime()
  const breakEnd = new Date(breakEndIso).getTime()

  const tasks = listTasksForEntry(entryId)
  const updatedTaskIds: string[] = []
  const createdTaskIds: string[] = []
  const deletedTaskIds: string[] = []

  for (const task of tasks) {
    if (!task.endTime) continue // skip active task
    const taskStart = new Date(task.startTime).getTime()
    const taskEnd = new Date(task.endTime).getTime()

    // No overlap
    if (taskEnd <= breakStart || taskStart >= breakEnd) continue

    if (taskStart >= breakStart && taskEnd <= breakEnd) {
      // Task fully inside break → delete
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

  return { updatedTaskIds, createdTaskIds, deletedTaskIds }
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
