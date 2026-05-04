import { listAllUnclosedEntriesBefore, updateEntry } from '@/lib/db/queries/entries'
import { listTasksForEntry, updateTask } from '@/lib/db/queries/tasks'
import { getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { breakToInterval } from '@/lib/business/breaks'
import { env } from '@/lib/env'
import type { Entry } from '@/types/db'

/**
 * Closes a single unclosed past entry:
 * - No tasks → day off: sets expectedMinutes = 0 so the calendar shows it as non-working
 * - Has tasks → extends the last task to fill the expected duration, then closes the entry
 */
export function autoCloseEntry(entry: Entry): void {
  const tasks = listTasksForEntry(entry.id)

  if (tasks.length === 0) {
    const endTime = entry.startTime ?? entry.date + 'T00:00:00.000Z'
    updateEntry(entry.id, { expectedMinutes: 0, endTime })
    console.log(`[auto-close] No tasks → day off: ${entry.date} (user ${entry.userId})`)
    return
  }

  const breaks = getEntryBreaks(entry.id)
  const totalBreakMs = breaks.reduce((sum, b) => {
    const { startIso, endIso } = breakToInterval(b, entry.date)
    return sum + (new Date(endIso).getTime() - new Date(startIso).getTime())
  }, 0)

  const firstStartMs = new Date(tasks[0].startTime).getTime()
  const expectedEndMs = firstStartMs + entry.expectedMinutes * 60_000 + totalBreakMs
  const expectedEndIso = new Date(expectedEndMs).toISOString()

  const lastTask = tasks[tasks.length - 1]
  const lastTaskStartMs = new Date(lastTask.startTime).getTime()
  const lastTaskEndMs = lastTask.endTime ? new Date(lastTask.endTime).getTime() : -Infinity

  if (expectedEndMs > lastTaskEndMs && expectedEndMs > lastTaskStartMs) {
    // Expected end is further than the last task's current end → extend it
    updateTask(lastTask.id, { endTime: expectedEndIso })
    updateEntry(entry.id, { endTime: expectedEndIso })
  } else if (lastTask.endTime) {
    // Last task already covers the expected duration → close entry at last task end
    updateEntry(entry.id, { endTime: lastTask.endTime })
  } else {
    updateEntry(entry.id, { endTime: expectedEndIso })
  }

  console.log(`[auto-close] Closed: ${entry.date} (user ${entry.userId})`)
}

/** Runs at startup to catch any entries missed by the cron (server downtime, etc.). */
export function runStartupAutoClose(): void {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const unclosed = listAllUnclosedEntriesBefore(today)
    for (const entry of unclosed) autoCloseEntry(entry)
    if (unclosed.length > 0) {
      console.log(`[auto-close] Startup: processed ${unclosed.length} unclosed entr${unclosed.length === 1 ? 'y' : 'ies'}`)
    }
  } catch (err) {
    console.error('[auto-close] Startup run failed:', err)
  }
}

/** Registers a nightly cron to auto-close entries from the previous day. */
export function scheduleAutoClose(): void {
  const cron = env.AUTO_CLOSE_CRON
  if (!cron) return

  import('node-cron')
    .then((nodeCron) => {
      nodeCron.schedule(cron, () => {
        const today = new Date().toISOString().slice(0, 10)
        try {
          const unclosed = listAllUnclosedEntriesBefore(today)
          for (const entry of unclosed) autoCloseEntry(entry)
        } catch (err) {
          console.error('[auto-close] Cron failed:', err)
        }
      })
      console.log(`[auto-close] Scheduled with cron: ${cron}`)
    })
    .catch((err) => console.error('[auto-close] Failed to load node-cron:', err))
}
