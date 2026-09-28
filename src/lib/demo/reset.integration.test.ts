import { describe, it, expect, beforeAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { v4 as uuidv4 } from 'uuid'

import { sqlite } from '@/lib/db'
import { createUser } from '@/lib/db/queries/users'
import { listEntries } from '@/lib/db/queries/entries'
import { listTasksForEntry } from '@/lib/db/queries/tasks'
import { resetDemoData } from '@/lib/demo/reset'

let userId = ''

beforeAll(() => {
  process.env.DB_PATH = path.join(os.tmpdir(), `wl-demo-${process.pid}-${Date.now()}.db`)
  process.env.SECRET_KEY = 'test-secret-key-test-secret-key-0123456789'
  process.env.ADMIN_EMAIL = 'admin@test.local'
  const dir = path.join(process.cwd(), 'drizzle/migrations')
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(fs.readFileSync(path.join(dir, f), 'utf8'))
  }
  userId = uuidv4()
  createUser({ id: userId, username: 'demo', email: 'demo@test.local', passwordHash: 'x', createdAt: new Date().toISOString() })
})

function seed(nowIso: string) {
  const now = new Date(nowIso)
  resetDemoData(userId, now)
  const all = listEntries(userId)
  const today = all.find((e) => e.date === nowIso.slice(0, 10))
  return { now, all, today, todayTasks: today ? listTasksForEntry(today.id) : [] }
}

describe('resetDemoData', () => {
  it('leaves today open with only started tasks and one running (Wed 12:30Z)', () => {
    const { now, all, today, todayTasks } = seed('2026-09-23T12:30:00.000Z')

    expect(all).toHaveLength(10)
    expect(today).toBeDefined()
    expect(today!.endTime).toBeNull()

    const running = todayTasks.filter((t) => t.endTime === null)
    expect(running).toHaveLength(1)
    expect(new Date(running[0].startTime).getTime()).toBeLessThanOrEqual(now.getTime())

    for (const t of todayTasks) {
      expect(new Date(t.startTime).getTime()).toBeLessThan(now.getTime())
      if (t.endTime) expect(new Date(t.endTime).getTime()).toBeLessThanOrEqual(now.getTime())
    }
  })

  it('keeps every past day closed with no running tasks', () => {
    const { all, today } = seed('2026-09-23T12:30:00.000Z')
    for (const e of all.filter((e) => e.id !== today!.id)) {
      expect(e.endTime).not.toBeNull()
      expect(listTasksForEntry(e.id).every((t) => t.endTime !== null)).toBe(true)
    }
  })

  it('has nothing running during a break, but the day stays open (14:30Z lunch)', () => {
    const { today, todayTasks } = seed('2026-09-23T14:30:00.000Z')
    expect(today!.endTime).toBeNull()
    expect(todayTasks.length).toBeGreaterThan(0)
    expect(todayTasks.every((t) => t.endTime !== null)).toBe(true)
  })

  it('keeps today open with the last task still running after hours (Mon 19:50Z)', () => {
    const { now, today, todayTasks } = seed('2026-09-28T19:50:00.000Z')
    expect(today!.endTime).toBeNull()

    const running = todayTasks.filter((t) => t.endTime === null)
    expect(running).toHaveLength(1)
    const last = todayTasks[todayTasks.length - 1]
    expect(running[0].id).toBe(last.id)
    expect(new Date(last.startTime).getTime()).toBeLessThan(now.getTime())
  })

  it('creates an open, empty today before the workday starts (07:00Z)', () => {
    const { today, todayTasks } = seed('2026-09-23T07:00:00.000Z')
    expect(today!.endTime).toBeNull()
    expect(todayTasks).toHaveLength(0)
  })

  it('seeds only closed workdays on a weekend (Sat)', () => {
    const { all, today } = seed('2026-09-26T12:00:00.000Z')
    expect(today).toBeUndefined()
    expect(all.every((e) => e.endTime !== null)).toBe(true)
  })
})
