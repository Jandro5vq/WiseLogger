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
import { createEntry, getEntryByDate, getEntryById } from '@/lib/db/queries/entries'
import { createTask, getTaskById, listTasksForEntry } from '@/lib/db/queries/tasks'
import { createEntryBreak, getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { findEntryOverlaps } from '@/lib/business/overlaps'
import { POST as createTaskRoute } from '@/app/api/entries/[id]/tasks/route'
import { PATCH as patchTaskRoute } from '@/app/api/tasks/[id]/route'
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

/** I1/I2 invariant check: no two intervals in the entry overlap, every
 * completed task has a strictly-later endTime. Reuses the same production
 * helper the write routes' own final safety net relies on. */
function assertEntryInvariants(entryId: string) {
  const entry = getEntryById(entryId)!
  const pairs = findEntryOverlaps(entryId, entry.date)
  expect(pairs, `unexpected overlap: ${JSON.stringify(pairs)}`).toHaveLength(0)
  for (const t of listTasksForEntry(entryId)) {
    if (t.endTime) {
      expect(new Date(t.endTime).getTime()).toBeGreaterThan(new Date(t.startTime).getTime())
    }
  }
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

describe('POST /api/entries/[id]/tasks — active task carving (exact reported bug)', () => {
  it('creating a completed task that fully covers the active one deletes it, no overlap left', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-01T11:00:00.000Z'))
    try {
      const { id: userId } = makeUser()
      const entry = createEntry({ id: uuidv4(), userId, date: '2026-05-01', expectedMinutes: 480 })
      const active = createTask({
        id: uuidv4(), entryId: entry.id, userId,
        startTime: '2026-05-01T10:30:00.000Z', description: 'Running', tags: '[]',
      })

      const res = await createTaskRoute(
        jsonRequest({ description: 'Overlapping', startTime: '2026-05-01T10:00:00.000Z', endTime: '2026-05-01T12:00:00.000Z' }),
        { params: { id: entry.id } }
      )
      expect(res.status).toBe(201)
      assertEntryInvariants(entry.id)
      expect(getTaskById(active.id)).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('pushes the active task later when only part of its elapsed span is covered', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-02T09:00:00.000Z'))
    try {
      const { id: userId } = makeUser()
      const entry = createEntry({ id: uuidv4(), userId, date: '2026-05-02', expectedMinutes: 480 })
      const active = createTask({
        id: uuidv4(), entryId: entry.id, userId,
        startTime: '2026-05-02T08:00:00.000Z', description: 'Running', tags: '[]',
      })

      const res = await createTaskRoute(
        jsonRequest({ description: 'Early meeting', startTime: '2026-05-02T07:30:00.000Z', endTime: '2026-05-02T08:30:00.000Z' }),
        { params: { id: entry.id } }
      )
      expect(res.status).toBe(201)
      assertEntryInvariants(entry.id)
      const refreshed = getTaskById(active.id)!
      expect(refreshed.endTime).toBeNull()
      expect(refreshed.startTime).toBe('2026-05-02T08:30:00.000Z')
    } finally {
      vi.useRealTimers()
    }
  })

  it('closes the active task when it started before the new completed span', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-03T12:00:00.000Z'))
    try {
      const { id: userId } = makeUser()
      const entry = createEntry({ id: uuidv4(), userId, date: '2026-05-03', expectedMinutes: 480 })
      const active = createTask({
        id: uuidv4(), entryId: entry.id, userId,
        startTime: '2026-05-03T08:00:00.000Z', description: 'Running', tags: '[]',
      })

      const res = await createTaskRoute(
        jsonRequest({ description: 'Later block', startTime: '2026-05-03T10:00:00.000Z', endTime: '2026-05-03T11:00:00.000Z' }),
        { params: { id: entry.id } }
      )
      expect(res.status).toBe(201)
      assertEntryInvariants(entry.id)
      expect(getTaskById(active.id)!.endTime).toBe('2026-05-03T10:00:00.000Z')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('POST /api/entries/[id]/tasks — date-entry validation (D5)', () => {
  it('rejects a startTime for a different calendar day than the entry', async () => {
    const { id: userId } = makeUser()
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-05-10', expectedMinutes: 480 })

    const res = await createTaskRoute(
      jsonRequest({ description: 'Wrong day', startTime: '2026-05-11T09:00:00.000Z' }),
      { params: { id: entry.id } }
    )
    expect(res.status).toBe(400)
  })
})

describe('POST /api/entries/[id]/tasks — closing the active task respects obstacles (D6)', () => {
  it('clamps the closed active task to the earliest obstacle, not the new task\'s raw start', async () => {
    const { id: userId } = makeUser()
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-05-11', expectedMinutes: 480 })
    const active = createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: '2026-05-11T08:00:00.000Z', description: 'Running', tags: '[]',
    })
    // A break between the active task's start and the new active task's start.
    createEntryBreak({
      id: uuidv4(), entryId: entry.id, userId,
      breakStart: '2026-05-11T09:00:00.000Z', durationMinutes: 30, label: null, fromRuleId: null,
    })

    const res = await createTaskRoute(
      jsonRequest({ description: 'Next', startTime: '2026-05-11T11:00:00.000Z' }),
      { params: { id: entry.id } }
    )
    expect(res.status).toBe(201)
    assertEntryInvariants(entry.id)
    expect(getTaskById(active.id)!.endTime).toBe('2026-05-11T09:00:00.000Z')
  })
})

describe('PATCH /api/tasks/[id] — active task hardening (D2–D5)', () => {
  it('rejects endTime:null reactivation when another task is already active', async () => {
    const { id: userId } = makeUser()
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-05-05', expectedMinutes: 480 })
    createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: '2026-05-05T09:00:00.000Z', description: 'Running', tags: '[]',
    })
    const completed = createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: '2026-05-05T07:00:00.000Z', endTime: '2026-05-05T08:00:00.000Z',
      description: 'Earlier', tags: '[]',
    })

    const res = await patchTaskRoute(jsonRequest({ endTime: null }), { params: { id: completed.id } })
    expect(res.status).toBe(409)
    expect(getTaskById(completed.id)!.endTime).toBe('2026-05-05T08:00:00.000Z')
  })

  it('reactivating a completed task validates and carves against its new elapsed span', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-06T09:00:00.000Z'))
    try {
      const { id: userId } = makeUser()
      const entry = createEntry({ id: uuidv4(), userId, date: '2026-05-06', expectedMinutes: 480 })
      const completed = createTask({
        id: uuidv4(), entryId: entry.id, userId,
        startTime: '2026-05-06T07:00:00.000Z', endTime: '2026-05-06T07:30:00.000Z',
        description: 'Resuming', tags: '[]',
      })
      // Fully inside the reactivated span [07:00, now=09:00) — should be carved away.
      const blocker = createTask({
        id: uuidv4(), entryId: entry.id, userId,
        startTime: '2026-05-06T08:00:00.000Z', endTime: '2026-05-06T08:30:00.000Z',
        description: 'Blocker', tags: '[]',
      })

      const res = await patchTaskRoute(jsonRequest({ endTime: null }), { params: { id: completed.id } })
      expect(res.status).toBe(200)
      assertEntryInvariants(entry.id)
      expect(getTaskById(completed.id)!.endTime).toBeNull()
      expect(getTaskById(blocker.id)).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('editing the startTime of an already-active task carves adjacent tasks', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-07T11:00:00.000Z'))
    try {
      const { id: userId } = makeUser()
      const entry = createEntry({ id: uuidv4(), userId, date: '2026-05-07', expectedMinutes: 480 })
      const blocker = createTask({
        id: uuidv4(), entryId: entry.id, userId,
        startTime: '2026-05-07T08:00:00.000Z', endTime: '2026-05-07T09:00:00.000Z',
        description: 'Earlier block', tags: '[]',
      })
      const active = createTask({
        id: uuidv4(), entryId: entry.id, userId,
        startTime: '2026-05-07T10:00:00.000Z', description: 'Running', tags: '[]',
      })

      const res = await patchTaskRoute(
        jsonRequest({ startTime: '2026-05-07T08:30:00.000Z' }),
        { params: { id: active.id } }
      )
      expect(res.status).toBe(200)
      assertEntryInvariants(entry.id)
      expect(getTaskById(blocker.id)!.endTime).toBe('2026-05-07T08:30:00.000Z')
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a startTime for a different calendar day than the entry', async () => {
    const { id: userId } = makeUser()
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-05-08', expectedMinutes: 480 })
    const task = createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: '2026-05-08T09:00:00.000Z', endTime: '2026-05-08T10:00:00.000Z',
      description: 'Task', tags: '[]',
    })

    const res = await patchTaskRoute(
      jsonRequest({ startTime: '2026-05-09T09:00:00.000Z' }),
      { params: { id: task.id } }
    )
    expect(res.status).toBe(400)
  })

  it('a pure description edit on an active task does not require the time range to be untouched', async () => {
    const { id: userId } = makeUser()
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-05-09', expectedMinutes: 480 })
    const active = createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: '2026-05-09T09:00:00.000Z', description: 'Running', tags: '[]',
    })

    const res = await patchTaskRoute(
      jsonRequest({ description: 'Renamed' }),
      { params: { id: active.id } }
    )
    expect(res.status).toBe(200)
    const refreshed = getTaskById(active.id)!
    expect(refreshed.description).toBe('Renamed')
    expect(refreshed.endTime).toBeNull()
  })
})

describe('PATCH /api/breaks/[id] — carves tasks instead of rejecting (D9)', () => {
  it('moving a break onto a completed task trims it and backfills the old gap', async () => {
    const { id: userId } = makeUser()
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-05-12', expectedMinutes: 480 })
    const b = createEntryBreak({
      id: uuidv4(), entryId: entry.id, userId,
      breakStart: '2026-05-12T07:00:00.000Z', durationMinutes: 30, label: null, fromRuleId: null,
    })
    const task = createTask({
      id: uuidv4(), entryId: entry.id, userId,
      startTime: '2026-05-12T09:00:00.000Z', endTime: '2026-05-12T11:00:00.000Z',
      description: 'Work', tags: '[]',
    })

    // Move the break from 07:00 into the middle of the task, 09:30–10:00.
    const res = await patchBreakRoute(
      jsonRequest({ breakStart: '2026-05-12T09:30:00.000Z' }),
      { params: { id: b.id } }
    )
    expect(res.status).toBe(200)
    assertEntryInvariants(entry.id)

    const tasks = listTasksForEntry(entry.id)
    expect(tasks).toHaveLength(2)
    expect(tasks[0].startTime).toBe('2026-05-12T09:00:00.000Z')
    expect(tasks[0].endTime).toBe('2026-05-12T09:30:00.000Z')
    expect(tasks[1].startTime).toBe('2026-05-12T10:00:00.000Z')
    expect(tasks[1].endTime).toBe('2026-05-12T11:00:00.000Z')
    expect(task.id).toBe(tasks[0].id)
  })

  it('still rejects a move that overlaps another break', async () => {
    const { id: userId } = makeUser()
    const entry = createEntry({ id: uuidv4(), userId, date: '2026-05-13', expectedMinutes: 480 })
    createEntryBreak({
      id: uuidv4(), entryId: entry.id, userId,
      breakStart: '2026-05-13T12:00:00.000Z', durationMinutes: 30, label: null, fromRuleId: null,
    })
    const b = createEntryBreak({
      id: uuidv4(), entryId: entry.id, userId,
      breakStart: '2026-05-13T07:00:00.000Z', durationMinutes: 30, label: null, fromRuleId: null,
    })

    const res = await patchBreakRoute(
      jsonRequest({ breakStart: '2026-05-13T12:15:00.000Z' }),
      { params: { id: b.id } }
    )
    expect(res.status).toBe(409)
  })
})

describe('POST /api/entries/[id]/breaks — carves the active task too (D8, legacy HH:MM input)', () => {
  it('a legacy HH:MM break input still closes the active task at its start', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-14T09:00:00.000Z'))
    try {
      const { id: userId } = makeUser()
      const entry = createEntry({ id: uuidv4(), userId, date: '2026-05-14', expectedMinutes: 480 })
      const active = createTask({
        id: uuidv4(), entryId: entry.id, userId,
        startTime: '2026-05-14T08:00:00.000Z', description: 'Running', tags: '[]',
      })

      const res = await createBreakRoute(
        jsonRequest({ breakStart: '08:30', durationMinutes: 15 }),
        { params: { id: entry.id } }
      )
      expect(res.status).toBe(201)
      assertEntryInvariants(entry.id)
      expect(getTaskById(active.id)!.endTime).toBe('2026-05-14T08:30:00.000Z')
    } finally {
      vi.useRealTimers()
    }
  })
})
