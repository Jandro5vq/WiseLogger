import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { v4 as uuidv4 } from 'uuid'

// Integration test: exercises splitTaskAcrossMidnights against a real migrated
// SQLite database, since the cross-entry mutation can't be unit-tested in isolation.
// The DB connection is a lazy singleton keyed on DB_PATH, so setting env + applying
// migrations in beforeAll (before the first DB access) is enough.
import { sqlite } from '@/lib/db'
import { createUser } from '@/lib/db/queries/users'
import { createEntry, getEntryByDate } from '@/lib/db/queries/entries'
import { createTask, getTaskById, listTasksForEntry } from '@/lib/db/queries/tasks'
import { splitTaskAcrossMidnights, adjustAdjacentTasksForEdit, splitTasksAroundBreak } from '@/lib/business/spans'

beforeAll(() => {
  process.env.DB_PATH = path.join(os.tmpdir(), `wl-spans-${process.pid}-${Date.now()}.db`)
  process.env.SECRET_KEY = 'test-secret-key-test-secret-key-0123456789'
  process.env.ADMIN_EMAIL = 'admin@test.local'
  // Apply migrations the same way scripts/migrate.js does: exec each .sql in order.
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
  return id // timezone defaults to 'UTC' in the schema
}

describe('splitTaskAcrossMidnights (integration)', () => {
  it('splits a UTC midnight-crossing task into two day-entries', () => {
    const userId = makeUser()
    const entry1 = createEntry({
      id: uuidv4(),
      userId,
      date: '2026-06-14',
      startTime: '2026-06-14T22:00:00.000Z',
      expectedMinutes: 495,
    })
    const task = createTask({
      id: uuidv4(),
      entryId: entry1.id,
      userId,
      startTime: '2026-06-14T23:00:00.000Z',
      endTime: '2026-06-15T01:00:00.000Z',
      description: 'Night work',
      tags: '[]',
    })

    splitTaskAcrossMidnights(task.id, userId, 'UTC')

    // Original task trimmed to local midnight
    const trimmed = getTaskById(task.id)!
    expect(trimmed.endTime).toBe('2026-06-15T00:00:00.000Z')

    // A day-2 entry was created with the continuation segment
    const entry2 = getEntryByDate(userId, '2026-06-15')
    expect(entry2).toBeTruthy()
    const day2 = listTasksForEntry(entry2!.id)
    expect(day2).toHaveLength(1)
    expect(day2[0].startTime).toBe('2026-06-15T00:00:00.000Z')
    expect(day2[0].endTime).toBe('2026-06-15T01:00:00.000Z')
    expect(day2[0].description).toBe('Night work')

    // Day-1 entry still holds exactly the trimmed original
    expect(listTasksForEntry(entry1.id)).toHaveLength(1)
  })

  it('is a no-op for a same-day task', () => {
    const userId = makeUser()
    const entry = createEntry({
      id: uuidv4(),
      userId,
      date: '2026-06-14',
      startTime: '2026-06-14T08:00:00.000Z',
      expectedMinutes: 495,
    })
    const task = createTask({
      id: uuidv4(),
      entryId: entry.id,
      userId,
      startTime: '2026-06-14T09:00:00.000Z',
      endTime: '2026-06-14T10:00:00.000Z',
      description: 'Day work',
      tags: '[]',
    })

    splitTaskAcrossMidnights(task.id, userId, 'UTC')

    expect(getTaskById(task.id)!.endTime).toBe('2026-06-14T10:00:00.000Z')
    expect(listTasksForEntry(entry.id)).toHaveLength(1)
    // No stray next-day entry created
    expect(getEntryByDate(userId, '2026-06-15')).toBeFalsy()
  })
})

describe('adjustAdjacentTasksForEdit — active task carving', () => {
  it('pushes the active task later when its elapsed span outlives the new range', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-01T09:00:00.000Z'))
    const userId = makeUser()
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-07-01', expectedMinutes: 480 })
    const active = createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: '2026-07-01T08:00:00.000Z', description: 'Running', tags: '[]',
    })

    // New span [07:30, 08:30) covers the active task's start but not its full
    // elapsed range (it's still running at 09:00) — push, don't delete.
    const { affectedIds } = adjustAdjacentTasksForEdit(
      entry.id, '', '2026-07-01T07:30:00.000Z', '2026-07-01T08:30:00.000Z'
    )
    expect(affectedIds).toContain(active.id)
    const refreshed = getTaskById(active.id)!
    expect(refreshed.endTime).toBeNull()
    expect(refreshed.startTime).toBe('2026-07-01T08:30:00.000Z')
  })

  it('deletes the active task when its entire elapsed span is covered', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-02T09:00:00.000Z'))
    const userId = makeUser()
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-07-02', expectedMinutes: 480 })
    const active = createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: '2026-07-02T08:30:00.000Z', description: 'Running', tags: '[]',
    })

    // New span [08:00, 10:00) fully covers the active task's elapsed range [08:30, 09:00).
    const { deletedDescriptions } = adjustAdjacentTasksForEdit(
      entry.id, '', '2026-07-02T08:00:00.000Z', '2026-07-02T10:00:00.000Z'
    )
    expect(deletedDescriptions).toContain('Running')
    expect(getTaskById(active.id)).toBeUndefined()
  })

  it('closes the active task at the new range\'s start when it started earlier', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-03T12:00:00.000Z'))
    const userId = makeUser()
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-07-03', expectedMinutes: 480 })
    const active = createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: '2026-07-03T08:00:00.000Z', description: 'Running', tags: '[]',
    })

    const { affectedIds } = adjustAdjacentTasksForEdit(
      entry.id, '', '2026-07-03T10:00:00.000Z', '2026-07-03T11:00:00.000Z'
    )
    expect(affectedIds).toContain(active.id)
    expect(getTaskById(active.id)!.endTime).toBe('2026-07-03T10:00:00.000Z')
  })

  it('leaves the active task untouched when the new range only touches its start', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-04T10:00:00.000Z'))
    const userId = makeUser()
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-07-04', expectedMinutes: 480 })
    const active = createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: '2026-07-04T09:00:00.000Z', description: 'Running', tags: '[]',
    })

    const { affectedIds, deletedDescriptions } = adjustAdjacentTasksForEdit(
      entry.id, '', '2026-07-04T08:00:00.000Z', '2026-07-04T09:00:00.000Z'
    )
    expect(affectedIds).not.toContain(active.id)
    expect(deletedDescriptions).toHaveLength(0)
    const refreshed = getTaskById(active.id)!
    expect(refreshed.endTime).toBeNull()
    expect(refreshed.startTime).toBe('2026-07-04T09:00:00.000Z')
  })
})

describe('splitTasksAroundBreak — active task carving', () => {
  it('deletes the active task when a break covers its entire elapsed span', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-05T09:00:00.000Z'))
    const userId = makeUser()
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-07-05', expectedMinutes: 480 })
    const active = createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: '2026-07-05T08:30:00.000Z', description: 'Running', tags: '[]',
    })

    const result = splitTasksAroundBreak(entry.id, userId, '2026-07-05T08:00:00.000Z', '2026-07-05T10:00:00.000Z')
    expect(result.deletedTaskIds).toContain(active.id)
    expect(getTaskById(active.id)).toBeUndefined()
  })

  it('closes the active task at breakStart when the break is still ongoing', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-06T09:00:00.000Z'))
    const userId = makeUser()
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-07-06', expectedMinutes: 480 })
    const active = createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: '2026-07-06T08:00:00.000Z', description: 'Running', tags: '[]',
    })

    // Break started at 08:30 and hasn't ended yet (now = 09:00 < 10:00).
    const result = splitTasksAroundBreak(entry.id, userId, '2026-07-06T08:30:00.000Z', '2026-07-06T10:00:00.000Z')
    expect(result.updatedTaskIds).toContain(active.id)
    const refreshed = getTaskById(active.id)!
    expect(refreshed.endTime).toBe('2026-07-06T08:30:00.000Z')
    // No new task resumes automatically — the break hasn't ended.
    expect(listTasksForEntry(entry.id)).toHaveLength(1)
  })

  it('resumes the active task from breakEnd when the break covered its start but has already ended', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-07T10:00:00.000Z'))
    const userId = makeUser()
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-07-07', expectedMinutes: 480 })
    const active = createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: '2026-07-07T08:30:00.000Z', description: 'Running', tags: '[]',
    })

    // Break [08:00, 09:00) already ended by "now" (10:00) and covers the active task's start.
    const result = splitTasksAroundBreak(entry.id, userId, '2026-07-07T08:00:00.000Z', '2026-07-07T09:00:00.000Z')
    expect(result.updatedTaskIds).toContain(active.id)
    const refreshed = getTaskById(active.id)!
    expect(refreshed.endTime).toBeNull()
    expect(refreshed.startTime).toBe('2026-07-07T09:00:00.000Z')
  })

  it('closes at breakStart and immediately resumes a new active task when the break already ended mid-span', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-08T10:00:00.000Z'))
    const userId = makeUser()
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-07-08', expectedMinutes: 480 })
    const active = createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: '2026-07-08T08:00:00.000Z', description: 'Running', tags: '["a"]',
    })

    // Break [08:30, 09:00) is entirely inside the elapsed span [08:00, now=10:00) and already over.
    const result = splitTasksAroundBreak(entry.id, userId, '2026-07-08T08:30:00.000Z', '2026-07-08T09:00:00.000Z')
    expect(result.updatedTaskIds).toContain(active.id)
    expect(result.createdTaskIds).toHaveLength(1)

    const original = getTaskById(active.id)!
    expect(original.endTime).toBe('2026-07-08T08:30:00.000Z')

    const resumed = getTaskById(result.createdTaskIds[0])!
    expect(resumed.startTime).toBe('2026-07-08T09:00:00.000Z')
    expect(resumed.endTime).toBeNull()
    expect(resumed.description).toBe('Running')
    expect(resumed.tags).toBe('["a"]')
  })
})
