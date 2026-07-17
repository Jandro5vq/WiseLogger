import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { v4 as uuidv4 } from 'uuid'

// Integration coverage for the correctness hardening round: notes/tags surviving
// span operations, the shared stopTask invariants, timezone-aware balance defaults,
// the auto-close working-window sweep, and the MCP writers keeping the day-split
// invariant.
import { sqlite } from '@/lib/db'
import { createUser } from '@/lib/db/queries/users'
import { createEntry, getEntryById, getEntryByDate } from '@/lib/db/queries/entries'
import { createTask, getTaskById, listTasksForEntry } from '@/lib/db/queries/tasks'
import { createEntryBreak, getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { breakToInterval } from '@/lib/business/breaks'
import {
  splitTasksAroundBreak,
  autoSplitActiveTask,
  mergeContiguousSpans,
  extendPreviousTaskOnBreakDelete,
} from '@/lib/business/spans'
import { stopTask } from '@/lib/business/stop'
import { computeBalance } from '@/lib/business/balance'
import { autoCloseEntry } from '@/lib/business/auto-close'
import { sumWorkedMinutes } from '@/lib/business/break-math'
import { mcpTools } from '@/lib/mcp/tools'

beforeAll(() => {
  process.env.DB_PATH = path.join(os.tmpdir(), `wl-hardening-${process.pid}-${Date.now()}.db`)
  process.env.SECRET_KEY = 'test-secret-key-test-secret-key-0123456789'
  process.env.ADMIN_EMAIL = 'admin@test.local'
  const dir = path.join(process.cwd(), 'drizzle/migrations')
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(fs.readFileSync(path.join(dir, f), 'utf8'))
  }
})

afterEach(() => {
  vi.useRealTimers()
})

function makeUser(timezone = 'UTC'): string {
  const id = uuidv4()
  createUser({
    id,
    username: `u-${id.slice(0, 8)}`,
    email: `${id.slice(0, 8)}@test.local`,
    passwordHash: 'x',
    createdAt: new Date().toISOString(),
  })
  if (timezone !== 'UTC') {
    sqlite.prepare('UPDATE users SET timezone = ? WHERE id = ?').run(timezone, id)
  }
  return id
}

function makeEntry(userId: string, date: string, expectedMinutes = 480, startTime?: string) {
  return createEntry({ id: uuidv4(), userId, date, expectedMinutes, startTime })
}

const ms = (iso: string) => new Date(iso).getTime()

function mcpExecute(name: string, args: Record<string, unknown>, userId: string) {
  const tool = mcpTools.find((t) => t.name === name)
  if (!tool) throw new Error(`no such MCP tool: ${name}`)
  return tool.execute(args, userId) as Record<string, unknown>
}

// ─── A1: notes/tags survive span operations ───────────────────────────────────

describe('notes/tags preservation', () => {
  it('splitTasksAroundBreak keeps notes on the second half of a wrapped task', () => {
    const userId = makeUser()
    const entry = makeEntry(userId, '2026-03-02')
    createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: '2026-03-02T09:00:00.000Z', endTime: '2026-03-02T12:00:00.000Z',
      description: 'Wrapped', tags: '["x"]', notes: 'important context',
    })

    splitTasksAroundBreak(entry.id, userId, '2026-03-02T10:00:00.000Z', '2026-03-02T10:30:00.000Z')

    const halves = listTasksForEntry(entry.id)
    expect(halves).toHaveLength(2)
    for (const h of halves) {
      expect(h.notes).toBe('important context')
      expect(h.tags).toBe('["x"]')
    }
  })

  it('autoSplitActiveTask carries notes onto the resumed active task', () => {
    const userId = makeUser()
    const now = Date.now()
    const today = new Date(now).toISOString().slice(0, 10)
    const entry = makeEntry(userId, today)
    createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: new Date(now - 2 * 3600_000).toISOString(),
      description: 'Running', tags: '["y"]', notes: 'keep me',
    })
    // Break started 1h ago and already ended → task splits and resumes.
    createEntryBreak({
      id: uuidv4(), entryId: entry.id, userId,
      breakStart: new Date(now - 3600_000).toISOString(), durationMinutes: 15,
      label: null, fromRuleId: null,
    })

    expect(autoSplitActiveTask(entry.id, userId, today)).toBe(true)

    const active = listTasksForEntry(entry.id).find((t) => !t.endTime)!
    expect(active.notes).toBe('keep me')
    expect(active.tags).toBe('["y"]')
  })

  it('mergeContiguousSpans coalesces notes and never merges spans with different tags', () => {
    const userId = makeUser()
    const entry = makeEntry(userId, '2026-03-03')
    // Same description + same tags, contiguous, notes on the second span only.
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-03-03T09:00:00.000Z', endTime: '2026-03-03T10:00:00.000Z', description: 'Same', tags: '["a"]' })
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-03-03T10:00:00.000Z', endTime: '2026-03-03T11:00:00.000Z', description: 'Same', tags: '["a"]', notes: 'only on next' })
    // Same description but different tags, contiguous with the block above.
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-03-03T11:00:00.000Z', endTime: '2026-03-03T12:00:00.000Z', description: 'Same', tags: '["b"]', notes: 'other tags' })

    mergeContiguousSpans(entry.id)

    const tasks = listTasksForEntry(entry.id)
    expect(tasks).toHaveLength(2)
    const merged = tasks.find((t) => t.tags === '["a"]')!
    expect(merged.startTime).toBe('2026-03-03T09:00:00.000Z')
    expect(merged.endTime).toBe('2026-03-03T11:00:00.000Z')
    expect(merged.notes).toBe('only on next')
    const other = tasks.find((t) => t.tags === '["b"]')!
    expect(other.notes).toBe('other tags')
  })

  it('mergeContiguousSpans joins differing notes instead of dropping one', () => {
    const userId = makeUser()
    const entry = makeEntry(userId, '2026-03-04')
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-03-04T09:00:00.000Z', endTime: '2026-03-04T10:00:00.000Z', description: 'T', tags: '[]', notes: 'first' })
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-03-04T10:00:00.000Z', endTime: '2026-03-04T11:00:00.000Z', description: 'T', tags: '[]', notes: 'second' })

    mergeContiguousSpans(entry.id)

    const tasks = listTasksForEntry(entry.id)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].notes).toBe('first\nsecond')
  })

  it('extendPreviousTaskOnBreakDelete keeps the absorbed span notes', () => {
    const userId = makeUser()
    const entry = makeEntry(userId, '2026-03-05')
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-03-05T09:00:00.000Z', endTime: '2026-03-05T10:00:00.000Z', description: 'Same', tags: '[]' })
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-03-05T10:30:00.000Z', endTime: '2026-03-05T11:00:00.000Z', description: 'Same', tags: '[]', notes: 'from next' })

    extendPreviousTaskOnBreakDelete(entry.id, '2026-03-05T10:00:00.000Z', '2026-03-05T10:30:00.000Z')

    const tasks = listTasksForEntry(entry.id)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].notes).toBe('from next')
  })
})

// ─── A2: shared stopTask ──────────────────────────────────────────────────────

describe('stopTask', () => {
  it('rejects an endTime at or before the task start', () => {
    const userId = makeUser()
    const entry = makeEntry(userId, '2026-03-09')
    const t = createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-03-09T10:00:00.000Z', description: 'Active', tags: '[]' })

    const result = stopTask(t.id, userId, 'UTC', '2026-03-09T09:00:00.000Z')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
    expect(getTaskById(t.id)!.endTime).toBeNull()
  })

  it('rejects stopping an already-stopped task', () => {
    const userId = makeUser()
    const entry = makeEntry(userId, '2026-03-09')
    const t = createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-03-09T12:00:00.000Z', endTime: '2026-03-09T13:00:00.000Z', description: 'Done', tags: '[]' })

    const result = stopTask(t.id, userId, 'UTC')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(409)
  })

  it('clamps the endTime to the first obstacle (break) after the start', () => {
    const userId = makeUser()
    const entry = makeEntry(userId, '2026-03-10')
    const t = createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-03-10T09:00:00.000Z', description: 'Active', tags: '[]' })
    createEntryBreak({ id: uuidv4(), entryId: entry.id, userId, breakStart: '2026-03-10T10:00:00.000Z', durationMinutes: 30, label: null, fromRuleId: null })

    const result = stopTask(t.id, userId, 'UTC', '2026-03-10T11:00:00.000Z')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.task.endTime).toBe('2026-03-10T10:00:00.000Z')
  })

  it('rejects stopping when a break already covers the task\'s own start', () => {
    // Pre-existing corrupt state (a break created before this hardening could
    // still cover the start of an already-running task). No endTime can fix
    // that — stopTask must refuse rather than persist a stop that still overlaps.
    const userId = makeUser()
    const entry = makeEntry(userId, '2026-03-10')
    const t = createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-03-10T09:30:00.000Z', description: 'Active', tags: '[]' })
    createEntryBreak({ id: uuidv4(), entryId: entry.id, userId, breakStart: '2026-03-10T09:00:00.000Z', durationMinutes: 60, label: null, fromRuleId: null })

    const result = stopTask(t.id, userId, 'UTC', '2026-03-10T11:00:00.000Z')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(409)
    expect(getTaskById(t.id)!.endTime).toBeNull()
  })

  it('splits a stop that crosses local midnight into per-day segments', () => {
    const userId = makeUser()
    const entry = makeEntry(userId, '2026-03-11', 480, '2026-03-11T22:00:00.000Z')
    const t = createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-03-11T23:00:00.000Z', description: 'Night', tags: '[]' })

    const result = stopTask(t.id, userId, 'UTC', '2026-03-12T01:00:00.000Z')
    expect(result.ok).toBe(true)
    expect(getTaskById(t.id)!.endTime).toBe('2026-03-12T00:00:00.000Z')
    const day2 = getEntryByDate(userId, '2026-03-12')!
    expect(listTasksForEntry(day2.id)[0].startTime).toBe('2026-03-12T00:00:00.000Z')
    expect(listTasksForEntry(day2.id)[0].endTime).toBe('2026-03-12T01:00:00.000Z')
  })
})

// ─── A4: timezone-aware balance default ──────────────────────────────────────

describe('computeBalance default date', () => {
  it("includes the user's current local day when they are ahead of UTC", () => {
    // 20:00 UTC → 2026-06-14 in UTC, but already 2026-06-15 in Kiritimati (UTC+14).
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T20:00:00.000Z'))

    const userId = makeUser('Pacific/Kiritimati')
    const entry = makeEntry(userId, '2026-06-15', 60)
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-06-15T00:00:00.000Z', endTime: '2026-06-15T01:00:00.000Z', description: 'Local today', tags: '[]' })

    const withTz = computeBalance(userId, undefined, undefined, 'Pacific/Kiritimati')
    expect(withTz.days.map((d) => d.date)).toContain('2026-06-15')
    expect(withTz.totalWorkedMinutes).toBe(60)

    // The old UTC default would have excluded the user's current day entirely.
    const utcDefault = computeBalance(userId)
    expect(utcDefault.days.map((d) => d.date)).not.toContain('2026-06-15')
  })
})

// ─── A7: auto-close working-window sweep ─────────────────────────────────────

describe('autoCloseEntry — breaks outside the working window', () => {
  it('ignores a break that ends before the first task starts', () => {
    const userId = makeUser()
    const entry = makeEntry(userId, '2026-03-16', 120, '2026-03-16T08:00:00.000Z')
    // Break 08:00–08:30 is entirely before the first task at 09:00.
    createEntryBreak({ id: uuidv4(), entryId: entry.id, userId, breakStart: '2026-03-16T08:00:00.000Z', durationMinutes: 30, label: null, fromRuleId: null })
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-03-16T09:00:00.000Z', endTime: '2026-03-16T10:00:00.000Z', description: 'Work', tags: '[]' })

    autoCloseEntry(getEntryById(entry.id)!)

    const tasks = listTasksForEntry(entry.id)
    const breaks = getEntryBreaks(entry.id).map((b) => breakToInterval(b, '2026-03-16'))
    expect(sumWorkedMinutes(tasks, breaks)).toBe(120)
    // End at exactly 09:00 + 2h — the early break added nothing.
    expect(getEntryById(entry.id)!.endTime).toBe('2026-03-16T11:00:00.000Z')
  })

  it('extends over a break that straddles the expected end', () => {
    const userId = makeUser()
    const entry = makeEntry(userId, '2026-03-17', 120, '2026-03-17T09:00:00.000Z')
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-03-17T09:00:00.000Z', endTime: '2026-03-17T10:00:00.000Z', description: 'Work', tags: '[]' })
    // Break 10:50–11:20 straddles the naive end (11:00) → day must end 11:30.
    createEntryBreak({ id: uuidv4(), entryId: entry.id, userId, breakStart: '2026-03-17T10:50:00.000Z', durationMinutes: 30, label: null, fromRuleId: null })

    autoCloseEntry(getEntryById(entry.id)!)

    const tasks = listTasksForEntry(entry.id)
    const breaks = getEntryBreaks(entry.id).map((b) => breakToInterval(b, '2026-03-17'))
    expect(sumWorkedMinutes(tasks, breaks)).toBe(120)
    expect(getEntryById(entry.id)!.endTime).toBe('2026-03-17T11:30:00.000Z')
  })
})

// ─── A2/A6: MCP writers ──────────────────────────────────────────────────────

describe('MCP tools uphold span invariants', () => {
  it('stop_active_task rejects an end_time before the task start', () => {
    const userId = makeUser()
    const entry = makeEntry(userId, '2026-03-23')
    const t = createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-03-23T10:00:00.000Z', description: 'Active', tags: '[]' })

    const res = mcpExecute('stop_active_task', { end_time: '2026-03-23T09:00:00.000Z' }, userId)
    expect(res.error).toBeTruthy()
    expect(getTaskById(t.id)!.endTime).toBeNull()

    // Cleanup: stop it properly so later tests see no active task.
    expect(stopTask(t.id, userId, 'UTC', '2026-03-23T11:00:00.000Z').ok).toBe(true)
  })

  it('close_day splits an over-midnight active task at the day boundary', () => {
    const userId = makeUser()
    const entry = makeEntry(userId, '2026-03-24', 480, '2026-03-24T22:00:00.000Z')
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-03-24T23:00:00.000Z', description: 'Night', tags: '[]' })

    const res = mcpExecute('close_day', { date: '2026-03-24', end_time: '2026-03-25T01:00:00.000Z' }, userId)
    expect(res.error).toBeFalsy()

    expect(listTasksForEntry(entry.id).every((t) => t.endTime)).toBe(true)
    expect(listTasksForEntry(entry.id)[0].endTime).toBe('2026-03-25T00:00:00.000Z')
    const day2 = getEntryByDate(userId, '2026-03-25')!
    expect(listTasksForEntry(day2.id)[0].endTime).toBe('2026-03-25T01:00:00.000Z')
  })

  it('add_task splits a historical midnight-crossing task into day segments', () => {
    const userId = makeUser()

    const res = mcpExecute('add_task', {
      description: 'Imported',
      date: '2026-03-26',
      start_time: '2026-03-26T23:00:00.000Z',
      end_time: '2026-03-27T01:00:00.000Z',
    }, userId)
    expect(res.error).toBeFalsy()

    const day1 = getEntryByDate(userId, '2026-03-26')!
    const day2 = getEntryByDate(userId, '2026-03-27')!
    expect(listTasksForEntry(day1.id)[0].endTime).toBe('2026-03-27T00:00:00.000Z')
    expect(listTasksForEntry(day2.id)[0].startTime).toBe('2026-03-27T00:00:00.000Z')
  })

  it('edit_task re-splits when an edit pushes the task across midnight', () => {
    const userId = makeUser()
    const entry = makeEntry(userId, '2026-03-30')
    const t = createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-03-30T22:00:00.000Z', endTime: '2026-03-30T23:00:00.000Z', description: 'Late', tags: '[]' })

    const res = mcpExecute('edit_task', { task_id: t.id, end_time: '2026-03-31T01:00:00.000Z' }, userId)
    expect(res.error).toBeFalsy()

    expect(getTaskById(t.id)!.endTime).toBe('2026-03-31T00:00:00.000Z')
    const day2 = getEntryByDate(userId, '2026-03-31')!
    expect(listTasksForEntry(day2.id)[0].endTime).toBe('2026-03-31T01:00:00.000Z')
  })
})

// ─── invariant guard: no negative spans ever persisted ───────────────────────

describe('no negative-duration rows', () => {
  it('every completed task in the test DB has end > start', () => {
    const rows = sqlite
      .prepare('SELECT id, start_time as s, end_time as e FROM tasks WHERE end_time IS NOT NULL')
      .all() as { id: string; s: string; e: string }[]
    for (const r of rows) {
      expect(ms(r.e), `task ${r.id}`).toBeGreaterThan(ms(r.s))
    }
  })
})
