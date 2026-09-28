import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { v4 as uuidv4 } from 'uuid'

// Creating a task always wins: it replaces/splits the active task, eats the
// completed tasks it covers and is itself split around breaks.
import { sqlite } from '@/lib/db'
import { createUser } from '@/lib/db/queries/users'
import { createEntry } from '@/lib/db/queries/entries'
import { createTask, getTaskById, listTasksForEntry } from '@/lib/db/queries/tasks'
import { createEntryBreak } from '@/lib/db/queries/entry-breaks'
import { buildEntryIntervals } from '@/lib/business/breaks'
import { hasInternalOverlap } from '@/lib/business/overlaps'
import { createTaskCarving } from '@/lib/business/create-task'
import { mcpTools } from '@/lib/mcp/tools'

beforeAll(() => {
  process.env.DB_PATH = path.join(os.tmpdir(), `wl-create-task-${process.pid}-${Date.now()}.db`)
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

function makeUser(): string {
  const id = uuidv4()
  createUser({
    id,
    username: `u-${id.slice(0, 8)}`,
    email: `${id.slice(0, 8)}@test.local`,
    passwordHash: 'x',
    createdAt: new Date().toISOString(),
  })
  return id
}

/** Freezes "now" and returns a fresh user with an entry for that day. */
function setup(nowIso: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(nowIso))
  const userId = makeUser()
  const date = nowIso.slice(0, 10)
  const entry = createEntry({ id: uuidv4(), userId, date, expectedMinutes: 480 })
  return { userId, entry, at: (hhmm: string) => `${date}T${hhmm}:00.000Z` }
}

function addBreak(entryId: string, userId: string, startIso: string, durationMinutes: number) {
  createEntryBreak({ id: uuidv4(), entryId, userId, breakStart: startIso, durationMinutes, label: null, fromRuleId: null })
}

function spans(entryId: string) {
  return listTasksForEntry(entryId).map((t) => [t.description, t.startTime.slice(11, 16), t.endTime?.slice(11, 16) ?? null])
}

function assertInvariants(entry: { id: string; date: string }) {
  expect(hasInternalOverlap(buildEntryIntervals(entry.id, entry.date, { includeActive: true }))).toBe(false)
  expect(listTasksForEntry(entry.id).filter((t) => !t.endTime).length).toBeLessThanOrEqual(1)
}

describe('createTaskCarving — in-progress task', () => {
  it('replaces an active task that started after the new start (no "fin posterior" error)', () => {
    const { userId, entry, at } = setup('2026-07-01T11:00:00.000Z')
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: at('10:00'), description: 'Old', tags: '[]' })

    const res = createTaskCarving({ entry, userId, timezone: 'UTC', description: 'New', tags: [], startIso: at('09:30') })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.deletedDescriptions).toEqual(['Old'])
    expect(spans(entry.id)).toEqual([['New', '09:30', null]])
    assertInvariants(entry)
  })

  it('closes the active task at the new start and carves it around a break', () => {
    const { userId, entry, at } = setup('2026-07-02T12:00:00.000Z')
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: at('09:00'), description: 'Old', tags: '[]' })
    addBreak(entry.id, userId, at('10:00'), 30)

    const res = createTaskCarving({ entry, userId, timezone: 'UTC', description: 'New', tags: [], startIso: at('11:00') })
    expect(res.ok).toBe(true)
    expect(spans(entry.id)).toEqual([
      ['Old', '09:00', '10:00'],
      ['Old', '10:30', '11:00'],
      ['New', '11:00', null],
    ])
    assertInvariants(entry)
  })

  it('eats completed tasks it covers and splits itself around a past break', () => {
    const { userId, entry, at } = setup('2026-07-03T12:00:00.000Z')
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: at('09:30'), endTime: at('10:00'), description: 'Covered', tags: '[]' })
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: at('10:30'), endTime: at('11:00'), description: 'Covered too', tags: '[]' })
    addBreak(entry.id, userId, at('10:00'), 30)

    const res = createTaskCarving({ entry, userId, timezone: 'UTC', description: 'New', tags: [], startIso: at('09:00') })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.deletedDescriptions.sort()).toEqual(['Covered', 'Covered too'])
    expect(spans(entry.id)).toEqual([
      ['New', '09:00', '10:00'],
      ['New', '10:30', null],
    ])
    expect(res.task.startTime).toBe(at('09:00'))
    assertInvariants(entry)
  })

  it('starting inside a finished break starts at the break end', () => {
    const { userId, entry, at } = setup('2026-07-04T12:00:00.000Z')
    addBreak(entry.id, userId, at('10:00'), 60)

    const res = createTaskCarving({ entry, userId, timezone: 'UTC', description: 'New', tags: [], startIso: at('10:15') })
    expect(res.ok).toBe(true)
    expect(spans(entry.id)).toEqual([['New', '11:00', null]])
    assertInvariants(entry)
  })

  it('during an ongoing break: creates the part before it as completed', () => {
    const { userId, entry, at } = setup('2026-07-05T10:15:00.000Z')
    addBreak(entry.id, userId, at('10:00'), 30)

    const res = createTaskCarving({ entry, userId, timezone: 'UTC', description: 'New', tags: [], startIso: at('09:00') })
    expect(res.ok).toBe(true)
    expect(spans(entry.id)).toEqual([['New', '09:00', '10:00']])
    assertInvariants(entry)
  })

  it('during an ongoing break with nothing before it: rejects and leaves the active task alone', () => {
    const { userId, entry, at } = setup('2026-07-06T10:15:00.000Z')
    const old = createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: at('09:00'), endTime: at('10:00'), description: 'Old', tags: '[]' })
    addBreak(entry.id, userId, at('10:00'), 30)

    const res = createTaskCarving({ entry, userId, timezone: 'UTC', description: 'New', tags: [], startIso: at('10:05') })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.status).toBe(400)
    expect(getTaskById(old.id)!.endTime).toBe(at('10:00'))
    expect(spans(entry.id)).toEqual([['Old', '09:00', '10:00']])
  })
})

describe('createTaskCarving — completed task', () => {
  it('inserted in the middle of the active task splits it and keeps it running', () => {
    const { userId, entry, at } = setup('2026-07-07T12:00:00.000Z')
    const active = createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: at('10:00'), description: 'Running', tags: '["a"]', notes: 'n' })

    const res = createTaskCarving({ entry, userId, timezone: 'UTC', description: 'Meeting', tags: [], startIso: at('11:00'), endIso: at('11:30') })
    expect(res.ok).toBe(true)
    expect(spans(entry.id)).toEqual([
      ['Running', '10:00', '11:00'],
      ['Meeting', '11:00', '11:30'],
      ['Running', '11:30', null],
    ])
    const resumed = listTasksForEntry(entry.id).find((t) => !t.endTime)!
    expect(resumed.id).not.toBe(active.id)
    expect(resumed.tags).toBe('["a"]')
    expect(resumed.notes).toBe('n')
    assertInvariants(entry)
  })

  it('crossing a break is split and trims/splits the tasks it covers', () => {
    const { userId, entry, at } = setup('2026-07-08T18:00:00.000Z')
    addBreak(entry.id, userId, at('10:00'), 30)
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: at('08:00'), endTime: at('10:00'), description: 'Wrap', tags: '[]' })
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: at('10:30'), endTime: at('12:00'), description: 'Wrap', tags: '[]' })

    const res = createTaskCarving({ entry, userId, timezone: 'UTC', description: 'New', tags: [], startIso: at('09:00'), endIso: at('11:00') })
    expect(res.ok).toBe(true)
    expect(spans(entry.id)).toEqual([
      ['Wrap', '08:00', '09:00'],
      ['New', '09:00', '10:00'],
      ['New', '10:30', '11:00'],
      ['Wrap', '11:00', '12:00'],
    ])
    assertInvariants(entry)
  })

  it('entirely inside a break is rejected', () => {
    const { userId, entry, at } = setup('2026-07-09T18:00:00.000Z')
    addBreak(entry.id, userId, at('10:00'), 60)

    const res = createTaskCarving({ entry, userId, timezone: 'UTC', description: 'New', tags: [], startIso: at('10:10'), endIso: at('10:50') })
    expect(res.ok).toBe(false)
    expect(listTasksForEntry(entry.id)).toHaveLength(0)
  })
})

describe('MCP add_task uses the same carving', () => {
  it('starts a task while another is active instead of rejecting', () => {
    const { userId, entry, at } = setup('2026-07-10T11:00:00.000Z')
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: at('09:00'), description: 'Old', tags: '[]' })

    const tool = mcpTools.find((t) => t.name === 'add_task')!
    const res = tool.execute({ description: 'New', start_time: at('10:00') }, userId) as Record<string, unknown>
    expect(res.error).toBeFalsy()
    expect(spans(entry.id)).toEqual([
      ['Old', '09:00', '10:00'],
      ['New', '10:00', null],
    ])
  })
})
