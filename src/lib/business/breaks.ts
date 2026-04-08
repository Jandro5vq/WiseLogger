import { v4 as uuidv4 } from 'uuid'
import { getBreakRules } from '@/lib/db/queries/break-rules'
import { getEntryBreaks, createEntryBreak } from '@/lib/db/queries/entry-breaks'

/**
 * Called once when a new entry is created.
 * Applies all matching break rules and seeds entryBreaks records.
 */
export function applyBreakRulesForEntry(
  userId: string,
  entryId: string,
  date: string,
  expectedMinutes: number
): void {
  const rules = getBreakRules(userId)
  const existing = getEntryBreaks(entryId)
  const existingRuleIds = new Set(existing.map((b) => b.fromRuleId).filter(Boolean))

  // Day-of-week for the entry date (0=Sun … 6=Sat)
  const dayOfWeek = new Date(date + 'T12:00:00').getDay()

  for (const rule of rules) {
    if (existingRuleIds.has(rule.id)) continue

    const matches =
      rule.ruleType === 'always' ||
      (rule.ruleType === 'schedule_duration' && rule.scheduleDuration === expectedMinutes) ||
      (rule.ruleType === 'weekday' && rule.weekday === dayOfWeek)

    if (matches) {
      createEntryBreak({
        id: uuidv4(),
        entryId,
        userId,
        breakStart: rule.breakStart,
        durationMinutes: rule.durationMinutes,
        label: rule.label ?? null,
        fromRuleId: rule.id,
      })
    }
  }
}
