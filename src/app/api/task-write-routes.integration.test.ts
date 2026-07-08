import { describe, it, expect, beforeAll, vi } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { v4 as uuidv4 } from 'uuid'
import type { NextRequest } from 'next/server'

// Route-level coverage for the write-path hardening: the backdated-active-task
// guard on task creation, break writers normalizing legacy HH:MM to UTC ISO,
// and the entry PATCH adjust pipeline (carve + midnight split).

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}))

import { getSession } from '@/lib/auth/session'
import { sqlite } from '@/lib/db'
import { createUser } from '@/lib/db/queries/users'
import { createEntry, getEntryByDate } from '@/lib/db/queries/entries'
import { createTask, getTaskById, listTasksForEntry } from '@/lib/db/queries/tasks'
import { createEntryBreak, getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { POST as createTaskRoute } from '@/app/api/entries/[id]/tasks/route'
import { POST as createBreakRoute } from '@/app/api/entries/[id]/breaks/route'
import { PATCH as patchBreakRoute } from '@/app/api/breaks/[id]/route'
import { PATCH as patchEntryRoute } from '@/app/api/entries/[id]/route'

beforeAll(() => {
  process.env.DB_PATH = path.join(os.tmpdir(), `wl-routes-${process.pid}-${Date.now()}.db`)
  process.env.SECRET_KEY = 'test-secret-key-test-secret-key-0123456789'
  process.env.ADMIN_EMAIL = 'admin@test.local'
  const dir = path.join(process.cwd(), 'drizzle/migrations')
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(fs.readFileSync(path.join(dir, f), 'utf8'))
  }
})

function makeUser(timezone = 'UTC'): { id: string } {
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
  vi.mocked(getSession).mockResolvedValue({
    user: { id, timezone },
  } as Awaited<ReturnType<typeof getSession>>)
  return { id }
}

function jsonRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

describe('POST /api/entries/[id]/tasks — backdated active task guard', () => {
  it('rejects a new active task starting at/before the current active task start', async () => {
    const { id: userId } = makeUser()
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-04-06', expectedMinutes: 480 })
    const active = createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: '2026-04-06T10:00:00.000Z', description: 'Running', tags: '[]',
    })

    const res = await createTaskRoute(
      jsonRequest({ description: 'Backdated', startTime: '2026-04-06T09:00:00.000Z' }),
      { params: { id: entry.id } }
    )
    expect(res.status).toBe(400)

    // The active task was not corrupted with an inverted endTime.
    expect(getTaskById(active.id)!.endTime).toBeNull()
  })

  it('still closes the active task for a later-starting new active task', async () => {
    const { id: userId } = makeUser()
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-04-07', expectedMinutes: 480 })
    const active = createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: '2026-04-07T09:00:00.000Z', description: 'Running', tags: '[]',
    })

    const res = await createTaskRoute(
      jsonRequest({ description: 'Next', startTime: '2026-04-07T10:00:00.000Z' }),
      { params: { id: entry.id } }
    )
    expect(res.status).toBe(201)
    expect(getTaskById(active.id)!.endTime).toBe('2026-04-07T10:00:00.000Z')
  })
})

describe('break writers normalize legacy HH:MM to UTC ISO', () => {
  it('POST /api/entries/[id]/breaks persists an ISO instant in the user timezone', async () => {
    const { id: userId } = makeUser('America/Bogota') // UTC-5
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-04-08', expectedMinutes: 480 })

    const res = await createBreakRoute(
      jsonRequest({ breakStart: '13:00', durationMinutes: 30 }),
      { params: { id: entry.id } }
    )
    expect(res.status).toBe(201)

    const stored = getEntryBreaks(entry.id)[0]
    expect(stored.breakStart).toBe('2026-04-08T18:00:00.000Z') // 13:00 -05:00
  })

  it('PATCH /api/breaks/[id] persists an ISO instant in the user timezone', async () => {
    const { id: userId } = makeUser('America/Bogota')
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-04-09', expectedMinutes: 480 })
    const b = createEntryBreak({
      id: uuidv4(), entryId: entry.id, userId,
      breakStart: '2026-04-09T17:00:00.000Z', durationMinutes: 30, label: null, fromRuleId: null,
    })

    const res = await patchBreakRoute(
      jsonRequest({ breakStart: '14:00' }),
      { params: { id: b.id } }
    )
    expect(res.status).toBe(200)

    const stored = getEntryBreaks(entry.id)[0]
    expect(stored.breakStart).toBe('2026-04-09T19:00:00.000Z') // 14:00 -05:00
  })
})

describe('PATCH /api/entries/[id] — adjustFirstTask runs the write pipeline', () => {
  it('carves the moved first task around a break instead of overlapping it', async () => {
    const { id: userId } = makeUser()
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-04-13', expectedMinutes: 480, startTime: '2026-04-13T09:00:00.000Z' })
    // Seeded morning break before the first task's current start.
    createEntryBreak({
      id: uuidv4(), entryId: entry.id, userId,
      breakStart: '2026-04-13T08:00:00.000Z', durationMinutes: 30, label: null, fromRuleId: null,
    })
    const first = createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: '2026-04-13T09:00:00.000Z', endTime: '2026-04-13T10:00:00.000Z',
      description: 'First', tags: '[]',
    })

    // Move day start (and the first task) to 07:30 — across the 08:00–08:30 break.
    const res = await patchEntryRoute(
      jsonRequest({ startTime: '2026-04-13T07:30:00.000Z', adjustFirstTask: true }),
      { params: { id: entry.id } }
    )
    expect(res.status).toBe(200)

    // The moved span was carved: no task overlaps the break.
    const tasks = listTasksForEntry(entry.id)
    for (const t of tasks) {
      const overlap =
        new Date(t.startTime).getTime() < new Date('2026-04-13T08:30:00.000Z').getTime() &&
        new Date('2026-04-13T08:00:00.000Z').getTime() < new Date(t.endTime!).getTime()
      expect(overlap).toBe(false)
    }
    // Both halves survive: 07:30–08:00 and 08:30–10:00.
    expect(tasks).toHaveLength(2)
    expect(tasks[0].startTime).toBe('2026-04-13T07:30:00.000Z')
    expect(tasks[0].endTime).toBe('2026-04-13T08:00:00.000Z')
    expect(tasks[1].startTime).toBe('2026-04-13T08:30:00.000Z')
    expect(tasks[1].endTime).toBe('2026-04-13T10:00:00.000Z')
    expect(first.id).toBe(tasks[0].id)
  })

  it('splits an adjustLastTask extension that crosses local midnight', async () => {
    const { id: userId } = makeUser()
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-04-14', expectedMinutes: 480, startTime: '2026-04-14T20:00:00.000Z' })
    createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: '2026-04-14T22:00:00.000Z', endTime: '2026-04-14T23:00:00.000Z',
      description: 'Late', tags: '[]',
    })

    const res = await patchEntryRoute(
      jsonRequest({ endTime: '2026-04-15T01:00:00.000Z', adjustLastTask: true }),
      { params: { id: entry.id } }
    )
    expect(res.status).toBe(200)

    expect(listTasksForEntry(entry.id)[0].endTime).toBe('2026-04-15T00:00:00.000Z')
    const day2 = getEntryByDate(userId, '2026-04-15')!
    expect(listTasksForEntry(day2.id)[0].endTime).toBe('2026-04-15T01:00:00.000Z')
  })
})
