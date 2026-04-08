import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { getEntryByDate, updateEntry, listEntries } from '@/lib/db/queries/entries'
import { getActiveTask, createTask, updateTask, listTasksForEntry } from '@/lib/db/queries/tasks'
import { autoCreateEntry, todayDateString } from '@/lib/business/tasks'
import { computeBalance, computeEntryWorkedMinutes } from '@/lib/business/balance'
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
    description: 'Get the full summary for today including worked time, expected time, balance, and task list.',
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
      'Get the summary for any specific date: worked time, expected time, balance, and task list. ' +
      'Use this to check what has already been imported for a past day before adding tasks.',
    schema: z.object({
      date: z.string().describe('Date in YYYY-MM-DD format'),
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
      'List all days that have a recorded shift entry, optionally filtered by date range. ' +
      'Useful to see which past days have already been imported.',
    schema: z.object({
      from: z.string().optional().describe('Start date YYYY-MM-DD (inclusive)'),
      to: z.string().optional().describe('End date YYYY-MM-DD (inclusive)'),
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
      'Start a work day by creating a shift entry. Defaults to today. ' +
      'Pass a date to create an entry for a past day (useful for importing historical data).',
    schema: z.object({
      date: z.string().optional().describe('Date YYYY-MM-DD (defaults to today)'),
      start_time: z.string().optional().describe('ISO 8601 shift start time (defaults to now)'),
    }),
    execute: (args, userId) => {
      const { date, start_time } = args as { date?: string; start_time?: string }
      const targetDate = date ?? todayDateString()
      const entry = autoCreateEntry(userId, targetDate)
      // If a custom start_time was provided and the entry was just created, update it
      if (start_time) {
        const existing = getEntryByDate(userId, targetDate)
        if (existing) updateEntry(existing.id, { startTime: start_time })
      }
      return {
        message: 'Shift started',
        date: entry.date,
        expectedMinutes: entry.expectedMinutes,
      }
    },
  },

  {
    name: 'close_day',
    description: 'Close a work day shift. Defaults to today. Pass a date to close a past day.',
    schema: z.object({
      date: z.string().optional().describe('Date YYYY-MM-DD (defaults to today)'),
      end_time: z.string().optional().describe('ISO 8601 end time (defaults to now)'),
    }),
    execute: (args, userId) => {
      const { date, end_time } = args as { date?: string; end_time?: string }
      const targetDate = date ?? todayDateString()
      const entry = getEntryByDate(userId, targetDate)
      if (!entry) return { error: `No shift found for ${targetDate}` }
      if (entry.endTime) return { error: 'Shift already closed', date: targetDate }

      const updated = updateEntry(entry.id, { endTime: end_time ?? new Date().toISOString() })
      return { message: 'Shift closed', date: targetDate, endTime: updated?.endTime }
    },
  },

  // ── tasks ──────────────────────────────────────────────────────────────────
  {
    name: 'add_task',
    description:
      'Add a task to a work day. Defaults to today. ' +
      'Pass a date to add tasks to a past day — the shift entry is created automatically if it does not exist. ' +
      'Always provide both start_time and end_time when importing historical data.',
    schema: z.object({
      description: z.string().describe('Task description'),
      tags: z.array(z.string()).optional().describe('Optional list of tags'),
      date: z.string().optional().describe('Date YYYY-MM-DD (defaults to today)'),
      start_time: z.string().optional().describe('ISO 8601 start time (defaults to now)'),
      end_time: z.string().optional().describe('ISO 8601 end time — omit only for a live active task'),
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

      // Only enforce single-active-task rule for today
      if (isToday && !end_time) {
        const active = getActiveTask(userId)
        if (active) return { error: 'A task is already active. Stop it first or provide an end_time.' }
      }

      const entry = autoCreateEntry(userId, targetDate)

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
    description: 'Stop the currently active task.',
    schema: z.object({
      end_time: z.string().optional().describe('ISO 8601 end time (defaults to now)'),
    }),
    execute: (args, userId) => {
      const { end_time } = args as { end_time?: string }
      const active = getActiveTask(userId)
      if (!active) return { error: 'No active task' }

      const updated = updateTask(active.id, { endTime: end_time ?? new Date().toISOString() })
      return parseTaskTags(updated!)
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
