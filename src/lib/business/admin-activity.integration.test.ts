import { describe, it, expect, beforeAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { v4 as uuidv4 } from 'uuid'

import { sqlite } from '@/lib/db'
import { createUser } from '@/lib/db/queries/users'
import { createEntry } from '@/lib/db/queries/entries'
import { createTask } from '@/lib/db/queries/tasks'
import { createEntryBreak } from '@/lib/db/queries/entry-breaks'
import { computeActivitySummary } from '@/lib/business/admin-activity'

beforeAll(() => {
  process.env.DB_PATH = path.join(os.tmpdir(), `wl-activity-${process.pid}-${Date.now()}.db`)
  process.env.SECRET_KEY = 'test-secret-key-test-secret-key-0123456789'
  process.env.ADMIN_EMAIL = 'admin@test.local'
  const dir = path.join(process.cwd(), 'drizzle/migrations')
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(fs.readFileSync(path.join(dir, f), 'utf8'))
  }
})

function makeUser(username: string): string {
  const id = uuidv4()
  createUser({ id, username, email: `${username}@test.local`, passwordHash: 'x', createdAt: new Date().toISOString() })
  return id
}

function addTask(userId: string, entryId: string, start: string, end: string | null) {
  return createTask({ id: uuidv4(), entryId, userId, startTime: start, endTime: end ?? undefined, description: 'secret task', tags: '[]' })
}

describe('computeActivitySummary', () => {
  it('reports instance totals and a coarse per-user pulse', () => {
    const alice = makeUser('alice')
    const bob = makeUser('bob')
    makeUser('carol') // never logs anything

    // alice: two days in range (one with a 30m break), one day before the range
    const a1 = createEntry({ id: uuidv4(), userId: alice, date: '2026-09-01', expectedMinutes: 480 })
    addTask(alice, a1.id, '2026-09-01T08:00:00.000Z', '2026-09-01T10:00:00.000Z')
    addTask(alice, a1.id, '2026-09-01T10:00:00.000Z', '2026-09-01T12:00:00.000Z')
    createEntryBreak({ id: uuidv4(), entryId: a1.id, userId: alice, breakStart: '2026-09-01T11:00:00.000Z', durationMinutes: 30 })
    const a2 = createEntry({ id: uuidv4(), userId: alice, date: '2026-09-02', expectedMinutes: 480 })
    addTask(alice, a2.id, '2026-09-02T08:00:00.000Z', '2026-09-02T09:00:00.000Z')
    const aOld = createEntry({ id: uuidv4(), userId: alice, date: '2026-08-15', expectedMinutes: 480 })
    addTask(alice, aOld.id, '2026-08-15T08:00:00.000Z', '2026-08-15T16:00:00.000Z')

    // bob: same day as alice, with a still-running task; plus an empty entry (no tasks)
    const b1 = createEntry({ id: uuidv4(), userId: bob, date: '2026-09-02', expectedMinutes: 480 })
    addTask(bob, b1.id, '2026-09-02T09:00:00.000Z', null)
    createEntry({ id: uuidv4(), userId: bob, date: '2026-09-03', expectedMinutes: 480 })

    const s = computeActivitySummary('2026-09-01', '2026-09-30')

    expect(s.totals.users).toBe(3)
    expect(s.totals.activeUsers).toBe(2)
    expect(s.totals.activeDays).toBe(3) // alice 2 + bob 1; empty entry doesn't count
    expect(s.totals.tasks).toBe(4)
    expect(s.totals.runningTasks).toBe(1)
    // alice: 4h - 30m break + 1h = 270m; bob's running task contributes nothing
    expect(s.totals.workedMinutes).toBe(270)

    expect(s.perDay).toEqual([
      { date: '2026-09-01', activeUsers: 1 },
      { date: '2026-09-02', activeUsers: 2 },
    ])

    const byName = Object.fromEntries(s.users.map((u) => [u.username, u]))
    expect(byName.alice.activeDays).toBe(2)
    expect(byName.alice.lastActivityAt).toBe('2026-09-02T09:00:00.000Z')
    expect(byName.bob.activeDays).toBe(1)
    expect(byName.bob.lastActivityAt).toBe('2026-09-02T09:00:00.000Z')
    expect(byName.carol.activeDays).toBe(0)
    expect(byName.carol.lastActivityAt).toBeNull()

    // Nothing per-user beyond the activity pulse
    for (const u of s.users) {
      expect(Object.keys(u).sort()).toEqual(
        ['activeDays', 'id', 'isActive', 'lastActivityAt', 'lastLoginAt', 'username'].sort()
      )
    }
    expect(JSON.stringify(s)).not.toContain('secret task')
  })
})
