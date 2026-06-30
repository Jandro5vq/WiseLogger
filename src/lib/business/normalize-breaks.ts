import { listAllEntryBreaks, updateEntryBreak } from '@/lib/db/queries/entry-breaks'
import { getEntryById } from '@/lib/db/queries/entries'
import { getUserById } from '@/lib/db/queries/users'
import { toBreakStartIso } from '@/lib/business/breaks'

/**
 * One-time, idempotent migration of legacy break rows whose `breakStart` is stored
 * as 'HH:MM' local time. Such rows are interpreted at read time using the server's
 * timezone (see breakToInterval's fallback), so a server in a different zone than the
 * user mis-places the break. We rewrite each to an absolute UTC ISO instant resolved
 * against the entry date in the user's own timezone.
 *
 * Rows already in ISO form are skipped, so this is safe to run on every startup.
 * Returns the number of rows rewritten.
 */
export function normalizeLegacyBreaks(): number {
  let migrated = 0
  for (const b of listAllEntryBreaks()) {
    // ISO rows start with a date; legacy rows are bare 'HH:MM'.
    if (/^\d{4}-\d{2}-\d{2}T/.test(b.breakStart)) continue

    const entry = getEntryById(b.entryId)
    if (!entry) continue // orphaned break — nothing to anchor it to
    const timezone = getUserById(b.userId)?.timezone ?? 'UTC'

    const iso = toBreakStartIso(b.breakStart, entry.date, timezone)
    updateEntryBreak(b.id, { breakStart: iso })
    migrated++
  }
  return migrated
}

/** Runs at startup to convert any legacy 'HH:MM' break rows to absolute ISO. */
export function runStartupBreakNormalization(): void {
  try {
    const migrated = normalizeLegacyBreaks()
    if (migrated > 0) {
      console.log(`[normalize-breaks] Rewrote ${migrated} legacy HH:MM break${migrated === 1 ? '' : 's'} to ISO`)
    }
  } catch (err) {
    console.error('[normalize-breaks] Startup run failed:', err)
  }
}
