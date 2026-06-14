/**
 * Pure break/time math — no DB imports, safe to use from client components.
 */

/**
 * Net task duration minus any overlapping break time, in minutes.
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
  breakIntervals: Array<{ startIso: string; endIso: string }>
): number {
  return breakIntervals.reduce((ov, bi) => {
    const oStart = Math.max(startMs, new Date(bi.startIso).getTime())
    const oEnd = Math.min(endMs, new Date(bi.endIso).getTime())
    return ov + Math.max(0, oEnd - oStart)
  }, 0)
}
