import { getScheduleRules } from '@/lib/db/queries/schedule-rules'

/**
 * Resolves how many minutes are expected for a given user/date.
 * Priority: specific_date > month+weekday > month (any weekday) > weekday > default
 */
export function resolveExpectedMinutes(userId: string, date: string): number {
  const rules = getScheduleRules(userId)
  if (rules.length === 0) {
    // Hardcoded fallback when no rules exist at all
    const day = new Date(date + 'T00:00:00').getDay()
    if (day === 0 || day === 6) return 0 // weekends
    return 495 // 8h15m
  }

  const d = new Date(date + 'T00:00:00')
  const weekday = d.getDay() // 0=Sunday … 6=Saturday
  const month = d.getMonth() + 1 // 1–12

  // 1. Exact date match
  const dateRule = rules.find((r) => r.ruleType === 'date' && r.specificDate === date)
  if (dateRule) return dateRule.durationMinutes

  // 2. Weekday scoped to month
  const monthWeekdayRule = rules.find(
    (r) => r.ruleType === 'month' && r.month === month && r.weekday === weekday
  )
  if (monthWeekdayRule) return monthWeekdayRule.durationMinutes

  // 3. Month rule (any weekday)
  const monthRule = rules.find(
    (r) => r.ruleType === 'month' && r.month === month && r.weekday === null
  )
  if (monthRule) return monthRule.durationMinutes

  // 4. Weekday rule
  const weekdayRule = rules.find((r) => r.ruleType === 'weekday' && r.weekday === weekday)
  if (weekdayRule) return weekdayRule.durationMinutes

  // 5. Default rule
  const defaultRule = rules.find((r) => r.ruleType === 'default')
  if (defaultRule) return defaultRule.durationMinutes

  return 495
}
