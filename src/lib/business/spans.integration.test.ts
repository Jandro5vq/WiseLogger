import { describe, it, expect, beforeAll } from 'vitest'
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
import { splitTaskAcrossMidnights } from '@/lib/business/spans'

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
