import { listUnclosedEntriesBefore, updateEntry } from '@/lib/db/queries/entries'
import { listTasksForEntry, updateTask } from '@/lib/db/queries/tasks'
import { listUsers } from '@/lib/db/queries/users'
import { getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { breakToInterval } from '@/lib/business/breaks'
import { splitTasksAroundBreak, mergeContiguousSpans } from '@/lib/business/spans'
import { dateStringInTz } from '@/lib/tz'
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

  const breakIntervals = getEntryBreaks(entry.id).map((b) => breakToInterval(b, entry.date))
  const totalBreakMs = breakIntervals.reduce(
    (sum, b) => sum + (new Date(b.endIso).getTime() - new Date(b.startIso).getTime()),
    0
  )

  // Wall-clock end of a full day: start, plus the expected net work, plus every break
  // taken during the day.
  const firstStartMs = new Date(tasks[0].startTime).getTime()
  const expectedEndMs = firstStartMs + entry.expectedMinutes * 60_000 + totalBreakMs

  const lastTask = tasks[tasks.length - 1] // tasks are ordered by startTime
  const lastStartMs = new Date(lastTask.startTime).getTime()
  const lastEndMs = lastTask.endTime ? new Date(lastTask.endTime).getTime() : lastStartMs

  // Never end the day before the last activity. An active last task is always closed.
  let endMs = Math.max(expectedEndMs, lastEndMs)
  if (!lastTask.endTime && endMs <= lastStartMs) endMs = lastStartMs + 60_000 // keep span > 0
  const endIso = new Date(endMs).toISOString()

  if (endMs > lastEndMs) {
    // Extend (or, if active, close) the last task to the day's end, then carve it back
    // out of any breaks it now spans so no task ever overlaps a break and the net
    // worked time matches the expected minutes.
    updateTask(lastTask.id, { endTime: endIso })
    for (const { startIso, endIso: bEnd } of breakIntervals) {
      splitTasksAroundBreak(entry.id, entry.userId, startIso, bEnd)
    }
    mergeContiguousSpans(entry.id)
    updateEntry(entry.id, { endTime: endIso })
  } else {
    // Last task already reaches the expected end → just close the entry at its end.
    updateEntry(entry.id, { endTime: lastTask.endTime ?? endIso })
  }

  console.log(`[auto-close] Closed: ${entry.date} (user ${entry.userId})`)
}

/**
 * Closes every user's unclosed past entries, using each user's own timezone to
 * decide what "before today" means. A user behind UTC who is still working late
 * must not have their current day closed because the server clock already rolled over.
 */
function closeStaleEntriesForAllUsers(): number {
  let processed = 0
  const now = new Date()
  for (const user of listUsers()) {
    const userToday = dateStringInTz(now, user.timezone)
    const unclosed = listUnclosedEntriesBefore(user.id, userToday)
    for (const entry of unclosed) {
      autoCloseEntry(entry)
      processed++
    }
  }
  return processed
}

/** Runs at startup to catch any entries missed by the cron (server downtime, etc.). */
export function runStartupAutoClose(): void {
  try {
    const processed = closeStaleEntriesForAllUsers()
    if (processed > 0) {
      console.log(`[auto-close] Startup: processed ${processed} unclosed entr${processed === 1 ? 'y' : 'ies'}`)
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
        try {
          closeStaleEntriesForAllUsers()
        } catch (err) {
          console.error('[auto-close] Cron failed:', err)
        }
      })
      console.log(`[auto-close] Scheduled with cron: ${cron}`)
    })
    .catch((err) => console.error('[auto-close] Failed to load node-cron:', err))
}
