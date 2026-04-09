import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { getEntryByDate, getEntryById, updateEntry, listEntries } from '@/lib/db/queries/entries'
import { getActiveTask, createTask, updateTask, deleteTask, getTaskById, listTasksForEntry } from '@/lib/db/queries/tasks'
import { getEntryBreakById, createEntryBreak, updateEntryBreak, deleteEntryBreak, getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { autoCreateEntry, todayDateString } from '@/lib/business/tasks'
import { computeBalance, computeEntryWorkedMinutes } from '@/lib/business/balance'
import { buildEntryIntervals, detectOverlap, breakToInterval } from '@/lib/business/breaks'
import { parseTaskTags } from '@/types/db'
import { formatMinutes } from '@/lib/utils'

export interface McpTool {
  name: string
  description: string
  schema: z.ZodObject<z.ZodRawShape>
  execute: (args: Record<string, unknown>, userId: string) => unknown
}

export const mcpTools: McpTool[] = [
  // ── today shorthand ────────────────────────────────────────────────────────
  {
    name: 'get_today_summary',
    description: 'Obtiene el resumen completo del día de hoy: tiempo trabajado, esperado, balance y lista de tareas.',
    schema: z.object({}),
    execute: (_args, userId) => {
      const today = todayDateString()
      return getDaySummary(userId, today)
    },
  },

  // ── any-date summary ───────────────────────────────────────────────────────
  {
    name: 'get_day_summary',
    description:
      'Obtiene el resumen de cualquier fecha: tiempo trabajado, esperado, balance y lista de tareas. ' +
      'Útil para verificar qué hay registrado antes de añadir tareas a un día pasado.',
    schema: z.object({
      date: z.string().describe('Fecha en formato YYYY-MM-DD'),
    }),
    execute: (args, userId) => {
      const { date } = args as { date: string }
      return getDaySummary(userId, date)
    },
  },

  // ── list days ──────────────────────────────────────────────────────────────
  {
    name: 'list_days',
    description:
      'Lista todos los días con registro de jornada, con filtro opcional de rango de fechas.',
    schema: z.object({
      from: z.string().optional().describe('Fecha inicio YYYY-MM-DD (incluida)'),
      to: z.string().optional().describe('Fecha fin YYYY-MM-DD (incluida)'),
    }),
    execute: (args, userId) => {
      const { from, to } = args as { from?: string; to?: string }
      const today = todayDateString()
      const all = listEntries(userId, from ?? '2000-01-01', to ?? today)
      return all.map((e) => ({
        date: e.date,
        expectedMinutes: e.expectedMinutes,
        workedMinutes: computeEntryWorkedMinutes(e.id),
        closed: !!e.endTime,
      }))
    },
  },

  // ── start / close day ─────────────────────────────────────────────────────
  {
    name: 'start_day',
    description:
      'Inicia la jornada laboral creando un registro. Por defecto usa la fecha de hoy. ' +
      'Pasa una fecha para crear registros de días pasados (útil al importar datos históricos).',
    schema: z.object({
      date: z.string().optional().describe('Fecha YYYY-MM-DD (por defecto hoy)'),
      start_time: z.string().optional().describe('Hora de inicio ISO 8601 (por defecto ahora)'),
    }),
    execute: (args, userId) => {
      const { date, start_time } = args as { date?: string; start_time?: string }
      const targetDate = date ?? todayDateString()
      const entry = autoCreateEntry(userId, targetDate)
      if (start_time) {
        const existing = getEntryByDate(userId, targetDate)
        if (existing) updateEntry(existing.id, { startTime: start_time })
      }
      return {
        message: 'Jornada iniciada',
        date: entry.date,
        expectedMinutes: entry.expectedMinutes,
      }
    },
  },

  {
    name: 'close_day',
    description: 'Cierra la jornada laboral. Por defecto usa la fecha de hoy.',
    schema: z.object({
      date: z.string().optional().describe('Fecha YYYY-MM-DD (por defecto hoy)'),
      end_time: z.string().optional().describe('Hora de fin ISO 8601 (por defecto ahora)'),
    }),
    execute: (args, userId) => {
      const { date, end_time } = args as { date?: string; end_time?: string }
      const targetDate = date ?? todayDateString()
      const entry = getEntryByDate(userId, targetDate)
      if (!entry) return { error: `No hay jornada registrada para ${targetDate}` }
      if (entry.endTime) return { error: 'La jornada ya está cerrada', date: targetDate }

      const updated = updateEntry(entry.id, { endTime: end_time ?? new Date().toISOString() })
      return { message: 'Jornada cerrada', date: targetDate, endTime: updated?.endTime }
    },
  },

  // ── tasks ──────────────────────────────────────────────────────────────────
  {
    name: 'add_task',
    description:
      'Añade una tarea a la jornada. Por defecto usa la fecha de hoy. ' +
      'Pasa una fecha para añadir tareas a días pasados — el registro de jornada se crea automáticamente si no existe. ' +
      'Proporciona siempre start_time y end_time al importar datos históricos.',
    schema: z.object({
      description: z.string().describe('Descripción de la tarea'),
      tags: z.array(z.string()).optional().describe('Lista opcional de etiquetas'),
      date: z.string().optional().describe('Fecha YYYY-MM-DD (por defecto hoy)'),
      start_time: z.string().optional().describe('Hora de inicio ISO 8601 (por defecto ahora)'),
      end_time: z.string().optional().describe('Hora de fin ISO 8601 — omitir solo para tarea activa'),
    }),
    execute: (args, userId) => {
      const { description, tags, date, start_time, end_time } = args as {
        description: string
        tags?: string[]
        date?: string
        start_time?: string
        end_time?: string
      }

      const targetDate = date ?? todayDateString()
      const isToday = targetDate === todayDateString()

      if (isToday && !end_time) {
        const active = getActiveTask(userId)
        if (active) return { error: 'Ya hay una tarea activa. Detenerla primero o proporcionar end_time.' }
      }

      const entry = autoCreateEntry(userId, targetDate)
      const tStart = new Date(start_time ?? new Date().toISOString()).getTime()

      if (end_time) {
        const tEnd = new Date(end_time).getTime()
        const existing = buildEntryIntervals(entry.id, targetDate)
        if (detectOverlap(existing, { start: tStart, end: tEnd })) {
          return { error: 'El intervalo se solapa con una tarea o pausa existente' }
        }
      }

      const task = createTask({
        id: uuidv4(),
        entryId: entry.id,
        userId,
        startTime: start_time ?? new Date().toISOString(),
        endTime: end_time,
        description,
        tags: JSON.stringify(tags ?? []),
      })

      return parseTaskTags(task)
    },
  },

  {
    name: 'stop_active_task',
    description: 'Detiene la tarea actualmente activa.',
    schema: z.object({
      end_time: z.string().optional().describe('Hora de fin ISO 8601 (por defecto ahora)'),
    }),
    execute: (args, userId) => {
      const { end_time } = args as { end_time?: string }
      const active = getActiveTask(userId)
      if (!active) return { error: 'No hay tarea activa' }

      const updated = updateTask(active.id, { endTime: end_time ?? new Date().toISOString() })
      return parseTaskTags(updated!)
    },
  },

  {
    name: 'edit_task',
    description: 'Edita una tarea existente por su ID.',
    schema: z.object({
      task_id: z.string().describe('ID de la tarea'),
      description: z.string().optional().describe('Nueva descripción'),
      tags: z.array(z.string()).optional().describe('Nueva lista de etiquetas'),
      start_time: z.string().optional().describe('Nueva hora de inicio ISO 8601'),
      end_time: z.string().optional().describe('Nueva hora de fin ISO 8601'),
    }),
    execute: (args, userId) => {
      const { task_id, description, tags, start_time, end_time } = args as {
        task_id: string
        description?: string
        tags?: string[]
        start_time?: string
        end_time?: string
      }

      const task = getTaskById(task_id)
      if (!task || task.userId !== userId) return { error: 'Tarea no encontrada' }

      const newStart = start_time ?? task.startTime
      const newEnd = end_time ?? task.endTime

      if (newEnd) {
        const tStart = new Date(newStart).getTime()
        const tEnd = new Date(newEnd).getTime()
        if (tEnd <= tStart) return { error: 'La hora de fin debe ser posterior a la de inicio' }

        const resolvedEntry = getEntryById(task.entryId)
        if (resolvedEntry) {
          const existing = buildEntryIntervals(task.entryId, resolvedEntry.date, { excludeTaskId: task.id })
          if (detectOverlap(existing, { start: tStart, end: tEnd })) {
            return { error: 'El intervalo se solapa con una tarea o pausa existente' }
          }
        }
      }

      const updates: Record<string, unknown> = {}
      if (description !== undefined) updates.description = description
      if (tags !== undefined) updates.tags = JSON.stringify(tags)
      if (start_time !== undefined) updates.startTime = start_time
      if (end_time !== undefined) updates.endTime = end_time

      const updated = updateTask(task_id, updates)
      return parseTaskTags(updated!)
    },
  },

  {
    name: 'delete_task',
    description: 'Elimina una tarea por su ID.',
    schema: z.object({
      task_id: z.string().describe('ID de la tarea'),
    }),
    execute: (args, userId) => {
      const { task_id } = args as { task_id: string }
      const task = getTaskById(task_id)
      if (!task || task.userId !== userId) return { error: 'Tarea no encontrada' }
      deleteTask(task_id)
      return { ok: true, message: 'Tarea eliminada' }
    },
  },

  // ── breaks ─────────────────────────────────────────────────────────────────
  {
    name: 'list_breaks',
    description: 'Lista todas las pausas de un día.',
    schema: z.object({
      date: z.string().optional().describe('Fecha YYYY-MM-DD (por defecto hoy)'),
    }),
    execute: (args, userId) => {
      const { date } = args as { date?: string }
      const targetDate = date ?? todayDateString()
      const entry = getEntryByDate(userId, targetDate)
      if (!entry) return { error: `No hay jornada registrada para ${targetDate}` }
      return getEntryBreaks(entry.id)
    },
  },

  {
    name: 'add_break',
    description: 'Añade una pausa a la jornada de un día.',
    schema: z.object({
      date: z.string().optional().describe('Fecha YYYY-MM-DD (por defecto hoy)'),
      break_start: z.string().describe('Hora de inicio de la pausa en formato HH:MM'),
      duration_minutes: z.number().describe('Duración de la pausa en minutos'),
      label: z.string().optional().describe('Etiqueta opcional, p. ej. "Comida"'),
    }),
    execute: (args, userId) => {
      const { date, break_start, duration_minutes, label } = args as {
        date?: string
        break_start: string
        duration_minutes: number
        label?: string
      }

      const targetDate = date ?? todayDateString()
      const entry = autoCreateEntry(userId, targetDate)

      const { startIso, endIso } = breakToInterval({ breakStart: break_start, durationMinutes: duration_minutes }, targetDate)
      const existing = buildEntryIntervals(entry.id, targetDate)
      if (detectOverlap(existing, { start: new Date(startIso).getTime(), end: new Date(endIso).getTime() })) {
        return { error: 'La pausa se solapa con una tarea o pausa existente' }
      }

      return createEntryBreak({
        id: uuidv4(),
        entryId: entry.id,
        userId,
        breakStart: break_start,
        durationMinutes: duration_minutes,
        label: label ?? null,
        fromRuleId: null,
      })
    },
  },

  {
    name: 'edit_break',
    description: 'Edita una pausa existente por su ID.',
    schema: z.object({
      break_id: z.string().describe('ID de la pausa'),
      break_start: z.string().optional().describe('Nueva hora de inicio HH:MM'),
      duration_minutes: z.number().optional().describe('Nueva duración en minutos'),
      label: z.string().optional().describe('Nueva etiqueta'),
    }),
    execute: (args, userId) => {
      const { break_id, break_start, duration_minutes, label } = args as {
        break_id: string
        break_start?: string
        duration_minutes?: number
        label?: string
      }

      const b = getEntryBreakById(break_id)
      if (!b || b.userId !== userId) return { error: 'Pausa no encontrada' }

      const newBreakStart = break_start ?? b.breakStart
      const newDuration = duration_minutes ?? b.durationMinutes

      // Need entry date for overlap check
      const breakEntry = getEntryById(b.entryId)
      if (breakEntry) {
        const { startIso, endIso } = breakToInterval({ breakStart: newBreakStart, durationMinutes: newDuration }, breakEntry.date)
        const existing = buildEntryIntervals(b.entryId, breakEntry.date, { excludeBreakId: b.id })
        if (detectOverlap(existing, { start: new Date(startIso).getTime(), end: new Date(endIso).getTime() })) {
          return { error: 'La pausa se solapa con una tarea o pausa existente' }
        }
      }

      const updates: Record<string, unknown> = {}
      if (break_start !== undefined) updates.breakStart = break_start
      if (duration_minutes !== undefined) updates.durationMinutes = duration_minutes
      if (label !== undefined) updates.label = label

      return updateEntryBreak(break_id, updates)
    },
  },

  {
    name: 'delete_break',
    description: 'Elimina una pausa por su ID.',
    schema: z.object({
      break_id: z.string().describe('ID de la pausa'),
    }),
    execute: (args, userId) => {
      const { break_id } = args as { break_id: string }
      const b = getEntryBreakById(break_id)
      if (!b || b.userId !== userId) return { error: 'Pausa no encontrada' }
      deleteEntryBreak(break_id)
      return { ok: true, message: 'Pausa eliminada' }
    },
  },
]

// ── shared helper ────────────────────────────────────────────────────────────

function getDaySummary(userId: string, date: string) {
  const entry = getEntryByDate(userId, date)
  if (!entry) {
    return { date, exists: false, workedTime: '0m', expectedTime: '0m', dayBalance: '0m', tasks: [] }
  }

  const rawTasks = listTasksForEntry(entry.id).map(parseTaskTags)
  const workedMinutes = computeEntryWorkedMinutes(entry.id)
  const { cumulativeBalance } = computeBalance(userId, date)

  return {
    date,
    exists: true,
    closed: !!entry.endTime,
    workedTime: formatMinutes(workedMinutes),
    expectedTime: formatMinutes(entry.expectedMinutes),
    dayBalance: formatMinutes(workedMinutes - entry.expectedMinutes),
    cumulativeBalance: formatMinutes(cumulativeBalance),
    tasks: rawTasks.map((t) => ({
      id: t.id,
      description: t.description,
      tags: t.tags,
      startTime: t.startTime,
      endTime: t.endTime ?? null,
    })),
  }
}
