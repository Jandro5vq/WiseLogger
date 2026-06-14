/**
 * Pure break/time math — no DB imports, safe to use from client components.
 */

/** An absolute break window. Shared across server and client code. */
export type BreakInterval = { startIso: string; endIso: string }

/** Minimal task shape needed for worked-time math. */
type TaskTimes = { startTime: string; endTime: string | null }

/**
 * Net task duration minus any overlapping break time, in minutes.
 * Returns a precise float — use it for live ticking / overlap math.
 * For displayed and aggregated values use {@link taskWorkedMinutes} so that
 * rows, days and totals always reconcile (see {@link sumWorkedMinutes}).
 * Known limitation: tasks spanning midnight are not split across entries.
 * Breaks on the next calendar day won't be deducted from midnight-spanning tasks.
 */
export function netTaskMinutes(
  startTime: string,
  endTime: string,
  breakIntervals: Array<{ startIso: string; endIso: string }>
): number {
  const taskStart = new Date(startTime).getTime()
  const taskEnd = new Date(endTime).getTime()
  const taskMs = taskEnd - taskStart

  const overlapMs = breakIntervals.reduce((ov, bi) => {
    const oStart = Math.max(taskStart, new Date(bi.startIso).getTime())
    const oEnd = Math.min(taskEnd, new Date(bi.endIso).getTime())
    return ov + Math.max(0, oEnd - oStart)
  }, 0)

  return Math.max(0, taskMs - overlapMs) / 60_000
}

/** Total milliseconds of overlap between [startMs, nowMs] and the given break intervals. */
export function breakOverlapMs(
  startMs: number,
  endMs: number,
  breakIntervals: BreakInterval[]
): number {
  return breakIntervals.reduce((ov, bi) => {
    const oStart = Math.max(startMs, new Date(bi.startIso).getTime())
    const oEnd = Math.min(endMs, new Date(bi.endIso).getTime())
    return ov + Math.max(0, oEnd - oStart)
  }, 0)
}

/**
 * Canonical worked minutes for a single completed task segment: net minutes
 * rounded to a whole minute. This is the value to show per row AND to sum into
 * day/total figures, so everything reconciles by construction.
 */
export function taskWorkedMinutes(
  startTime: string,
  endTime: string,
  breakIntervals: BreakInterval[]
): number {
  return Math.round(netTaskMinutes(startTime, endTime, breakIntervals))
}

/**
 * Total worked minutes for a set of tasks: the sum of {@link taskWorkedMinutes}
 * over completed tasks (active tasks without an endTime are ignored).
 * Single source of truth for "worked time" across balance, summaries and views.
 */
export function sumWorkedMinutes(
  tasks: TaskTimes[],
  breakIntervals: BreakInterval[]
): number {
  return tasks.reduce(
    (sum, t) => (t.endTime ? sum + taskWorkedMinutes(t.startTime, t.endTime, breakIntervals) : sum),
    0
  )
}
