import { breakToInterval, type Interval } from '@/lib/business/breaks'
import { listTasksForEntry } from '@/lib/db/queries/tasks'
import { getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { listAllEntries } from '@/lib/db/queries/entries'

/**
 * Thrown by a write route's mutation logic when it cannot resolve an overlap
 * (or a pre-write validation fails) and the whole transaction must roll back.
 * Routes catch this once, right outside the `sqlite.transaction()` call, and
 * translate it into the matching HTTP response — this keeps "reject and never
 * persist a corrupt state" a single well-defined exit path per route instead of
 * scattered early returns from inside a transaction (which better-sqlite3 would
 * still commit unless the callback itself throws).
 */
export class WriteConflictError extends Error {
  status: 400 | 409
  constructor(message: string, status: 400 | 409 = 409) {
    super(message)
    this.status = status
    this.name = 'WriteConflictError'
  }
}

/**
 * True if any two intervals in the list overlap. Used as the final invariant
 * check at the end of every task/break write route, after carving — a defensive
 * net for cases the carving logic didn't anticipate, so a bug there fails loudly
 * (409, transaction rolled back) instead of silently persisting a solape.
 */
export function hasInternalOverlap(intervals: Interval[]): boolean {
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) return true
  }
  return false
}

/** One task or break, labeled for display/logging, as it participates in an overlap. */
export interface OverlapItem {
  kind: 'task' | 'break'
  id: string
  label: string
  start: number
  end: number
}

export interface OverlapPair {
  a: OverlapItem
  b: OverlapItem
}

/**
 * All pairwise overlaps among an entry's tasks and breaks (the active task, if
 * any, is included as [startTime, now]). Read-only — used by the startup sweep
 * and by the history UI to surface pre-existing corrupt state so the user can fix
 * it by hand (the write routes no longer let new corruption in, but data written
 * before this hardening may still contain it).
 */
export function findEntryOverlaps(entryId: string, entryDate: string): OverlapPair[] {
  const items: OverlapItem[] = []

  for (const t of listTasksForEntry(entryId)) {
    const start = new Date(t.startTime).getTime()
    const end = t.endTime ? new Date(t.endTime).getTime() : Math.max(start, Date.now())
    items.push({ kind: 'task', id: t.id, label: t.description, start, end })
  }
  for (const b of getEntryBreaks(entryId)) {
    const { startIso, endIso } = breakToInterval(b, entryDate)
    items.push({
      kind: 'break',
      id: b.id,
      label: b.label ?? 'Pausa',
      start: new Date(startIso).getTime(),
      end: new Date(endIso).getTime(),
    })
  }

  const pairs: OverlapPair[] = []
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]
      const b = items[j]
      if (a.start < b.end && b.start < a.end) pairs.push({ a, b })
    }
  }
  return pairs
}

/** One entry (day) that has at least one overlapping pair. */
export interface EntryOverlapReport {
  userId: string
  entryId: string
  date: string
  pairs: OverlapPair[]
}

/** Scans every entry across every user for overlaps. Read-only. */
export function findAllOverlaps(): EntryOverlapReport[] {
  const reports: EntryOverlapReport[] = []
  for (const entry of listAllEntries()) {
    const pairs = findEntryOverlaps(entry.id, entry.date)
    if (pairs.length > 0) {
      reports.push({ userId: entry.userId, entryId: entry.id, date: entry.date, pairs })
    }
  }
  return reports
}

/**
 * Runs at startup to log any pre-existing overlapping tasks/breaks. Read-only —
 * see the module doc on `findEntryOverlaps` for why this doesn't auto-repair.
 */
export function runStartupOverlapSweep(): void {
  try {
    const reports = findAllOverlaps()
    if (reports.length === 0) return
    console.warn(`[overlaps] Found ${reports.length} day(s) with overlapping tasks/breaks:`)
    for (const r of reports) {
      for (const { a, b } of r.pairs) {
        console.warn(
          `  user=${r.userId} date=${r.date} entry=${r.entryId}: ` +
          `${a.kind}:${a.id} "${a.label}" [${new Date(a.start).toISOString()}, ${new Date(a.end).toISOString()}) ` +
          `overlaps ${b.kind}:${b.id} "${b.label}" [${new Date(b.start).toISOString()}, ${new Date(b.end).toISOString()})`
        )
      }
    }
  } catch (err) {
    console.error('[overlaps] Startup sweep failed:', err)
  }
}
