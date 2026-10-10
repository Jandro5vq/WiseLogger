import { z } from 'zod'
import { MANUAL_SEASONAL_THEMES, SEASONAL_THEME_MODES } from '@/lib/seasonal-theme'

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

// Admin edit of a user. Username/email are normalized + checked for uniqueness in the route.
export const AdminUserPatchSchema = z
  .object({
    isActive: z.boolean().optional(),
    username: z.string().optional(),
    email: z.string().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'No hay cambios que aplicar')

export const SeasonalThemeSettingsSchema = z
  .object({
    seasonalThemeMode: z.enum(SEASONAL_THEME_MODES),
    manualSeasonalTheme: z.enum(MANUAL_SEASONAL_THEMES).nullable().optional(),
    manualSeasonalThemeUntil: z.string().datetime().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.seasonalThemeMode !== 'manual') return
    if (!value.manualSeasonalTheme) {
      ctx.addIssue({ code: 'custom', message: 'Selecciona una decoración manual', path: ['manualSeasonalTheme'] })
    }
    if (!value.manualSeasonalThemeUntil) {
      ctx.addIssue({ code: 'custom', message: 'Indica cuándo termina la decoración manual', path: ['manualSeasonalThemeUntil'] })
    } else if (new Date(value.manualSeasonalThemeUntil).getTime() <= Date.now()) {
      ctx.addIssue({ code: 'custom', message: 'La decoración manual debe terminar en el futuro', path: ['manualSeasonalThemeUntil'] })
    }
  })
