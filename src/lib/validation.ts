import { z } from 'zod'

// Shared request schemas. Zod objects strip unknown keys by default, so PATCH
// bodies can't smuggle columns like `id` or `userId` into a DB update.

const weekday = z.number().int().min(0).max(6)
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'breakStart debe tener formato HH:MM')
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'specificDate debe tener formato YYYY-MM-DD')

export const BreakRuleCreateSchema = z.object({
  ruleType: z.enum(['always', 'schedule_duration', 'weekday']),
  breakStart: hhmm,
  durationMinutes: z.number().int().min(1),
  scheduleDuration: z.number().int().min(0).nullable().optional(),
  weekday: weekday.nullable().optional(),
  label: z.string().nullable().optional(),
})
export const BreakRulePatchSchema = BreakRuleCreateSchema.partial()

export const ScheduleRuleCreateSchema = z.object({
  ruleType: z.enum(['default', 'weekday', 'month', 'date']),
  durationMinutes: z.number().int().min(0),
  weekday: weekday.nullable().optional(),
  month: z.number().int().min(1).max(12).nullable().optional(),
  specificDate: ymd.nullable().optional(),
  label: z.string().nullable().optional(),
})
export const ScheduleRulePatchSchema = ScheduleRuleCreateSchema.partial()
