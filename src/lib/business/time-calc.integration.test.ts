import { describe, it, expect, beforeAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { v4 as uuidv4 } from 'uuid'

// Integration coverage for the time-calculation hardening: break-input clamping,
// legacy-break normalization, break-delete extension clamping, midnight splitting via
// the entry-wide wrapper, auto-close fill+carve, and the global span invariants that
// must hold after any composition of mutations.
import { sqlite } from '@/lib/db'
import { createUser } from '@/lib/db/queries/users'
import { createEntry, getEntryById, getEntryByDate } from '@/lib/db/queries/entries'
import { createTask, listTasksForEntry } from '@/lib/db/queries/tasks'
import { createEntryBreak, getEntryBreaks, getEntryBreakById } from '@/lib/db/queries/entry-breaks'
import {
  breakToInterval,
  toBreakStartIso,
} from '@/lib/business/breaks'
import {
  extendPreviousTaskOnBreakDelete,
  splitEntryTasksAcrossMidnights,
  splitTasksAroundBreak,
} from '@/lib/business/spans'
import { deleteEntryBreak } from '@/lib/db/queries/entry-breaks'
import { normalizeLegacyBreaks } from '@/lib/business/normalize-breaks'
import { autoCloseEntry } from '@/lib/business/auto-close'
import { sumWorkedMinutes } from '@/lib/business/break-math'

beforeAll(() => {
  process.env.DB_PATH = path.join(os.tmpdir(), `wl-timecalc-${process.pid}-${Date.now()}.db`)
  process.env.SECRET_KEY = 'test-secret-key-test-secret-key-0123456789'
  process.env.ADMIN_EMAIL = 'admin@test.local'
  const dir = path.join(process.cwd(), 'drizzle/migrations')
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(fs.readFileSync(path.join(dir, f), 'utf8'))
  }
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
  // schema default tz is 'UTC'; override when a test needs a real offset
  if (timezone !== 'UTC') {
    sqlite.prepare('UPDATE users SET timezone = ? WHERE id = ?').run(timezone, id)
  }
  return id
}

function makeEntry(userId: string, date: string, expectedMinutes = 480, startTime?: string) {
  return createEntry({ id: uuidv4(), userId, date, expectedMinutes, startTime })
}

const ms = (iso: string) => new Date(iso).getTime()

/**
 * Asserts the core span invariants over every entry belonging to a user:
 *  - no completed task has end <= start
 *  - no two completed tasks in the same entry overlap
 *  - no completed task overlaps a break in its entry
 */
function assertInvariants(userId: string, dates: string[]) {
  for (const date of dates) {
    const entry = getEntryByDate(userId, date)
    if (!entry) continue
    const tasks = listTasksForEntry(entry.id).filter((t) => t.endTime)
    const breaks = getEntryBreaks(entry.id).map((b) => breakToInterval(b, entry.date))

    for (const t of tasks) {
      expect(ms(t.endTime!)).toBeGreaterThan(ms(t.startTime))
    }
    for (let i = 0; i < tasks.length; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        const a = tasks[i], b = tasks[j]
        const overlap = ms(a.startTime) < ms(b.endTime!) && ms(b.startTime) < ms(a.endTime!)
        expect(overlap).toBe(false)
      }
    }
    for (const t of tasks) {
      for (const b of breaks) {
        const overlap = ms(t.startTime) < ms(b.endIso) && ms(b.startIso) < ms(t.endTime!)
        expect(overlap).toBe(false)
      }
    }
  }
}

describe('breakToInterval — duration clamping', () => {
  it('never yields an inverted interval for a non-positive duration', () => {
    const a = breakToInterval({ breakStart: '2026-06-14T10:00:00.000Z', durationMinutes: -30 }, '2026-06-14')
    expect(ms(a.endIso)).toBeGreaterThanOrEqual(ms(a.startIso))
    const b = breakToInterval({ breakStart: '2026-06-14T10:00:00.000Z', durationMinutes: 0 }, '2026-06-14')
    expect(b.endIso).toBe(b.startIso)
  })
})

describe('toBreakStartIso', () => {
  it('passes ISO through unchanged and converts HH:MM with the timezone', () => {
    expect(toBreakStartIso('2026-06-14T10:00:00.000Z', '2026-06-14', 'UTC')).toBe('2026-06-14T10:00:00.000Z')
    // 13:00 in Bogota (UTC-5) is 18:00 UTC
    expect(toBreakStartIso('13:00', '2026-06-14', 'America/Bogota')).toBe('2026-06-14T18:00:00.000Z')
  })
})

describe('normalizeLegacyBreaks', () => {
  it('rewrites a legacy HH:MM break to an absolute ISO using the user timezone', () => {
    const userId = makeUser('America/Bogota')
    const entry = makeEntry(userId, '2026-05-10')
    createEntryBreak({
      id: uuidv4(),
      entryId: entry.id,
      userId,
      breakStart: '13:00', // legacy local time
      durationMinutes: 30,
      label: null,
      fromRuleId: null,
    })

    const migrated = normalizeLegacyBreaks()
    expect(migrated).toBeGreaterThanOrEqual(1)

    const after = getEntryBreaks(entry.id)[0]
    expect(after.breakStart).toBe('2026-05-10T18:00:00.000Z') // 13:00 -05:00
    // Idempotent: a second run leaves ISO rows untouched.
    const stored = after.breakStart
    normalizeLegacyBreaks()
    expect(getEntryBreaks(entry.id)[0].breakStart).toBe(stored)
  })
})

describe('extendPreviousTaskOnBreakDelete — overlap clamping', () => {
  it('extends only up to the next task, never over it', () => {
    const userId = makeUser()
    const entry = makeEntry(userId, '2026-05-11')
    // task A 09:00–10:00, break 10:00–10:30, task B (different desc) 10:30–11:00
    const a = createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-05-11T09:00:00.000Z', endTime: '2026-05-11T10:00:00.000Z', description: 'A', tags: '[]' })
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-05-11T10:30:00.000Z', endTime: '2026-05-11T11:00:00.000Z', description: 'B', tags: '[]' })

    // Deleting the break extends A — but B already starts at 10:30, so A must stop there.
    extendPreviousTaskOnBreakDelete(entry.id, '2026-05-11T10:00:00.000Z', '2026-05-11T10:30:00.000Z')

    const refreshedA = listTasksForEntry(entry.id).find((t) => t.id === a.id)!
    expect(refreshedA.endTime).toBe('2026-05-11T10:30:00.000Z')
    assertInvariants(userId, ['2026-05-11'])
  })

  it('merges into a same-description span that abuts the gap', () => {
    const userId = makeUser()
    const entry = makeEntry(userId, '2026-05-12')
    const a = createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-05-12T09:00:00.000Z', endTime: '2026-05-12T10:00:00.000Z', description: 'Same', tags: '[]' })
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-05-12T10:30:00.000Z', endTime: '2026-05-12T11:00:00.000Z', description: 'Same', tags: '[]' })

    extendPreviousTaskOnBreakDelete(entry.id, '2026-05-12T10:00:00.000Z', '2026-05-12T10:30:00.000Z')

    const tasks = listTasksForEntry(entry.id)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe(a.id)
    expect(tasks[0].startTime).toBe('2026-05-12T09:00:00.000Z')
    expect(tasks[0].endTime).toBe('2026-05-12T11:00:00.000Z')
  })
})

describe('splitEntryTasksAcrossMidnights', () => {
  it('splits a manually-entered midnight-crossing task into two day-entries', () => {
    const userId = makeUser()
    const entry = makeEntry(userId, '2026-05-13', 480, '2026-05-13T22:00:00.000Z')
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-05-13T23:00:00.000Z', endTime: '2026-05-14T01:00:00.000Z', description: 'Night', tags: '[]' })

    splitEntryTasksAcrossMidnights(entry.id, userId, 'UTC')

    expect(listTasksForEntry(entry.id)).toHaveLength(1)
    expect(listTasksForEntry(entry.id)[0].endTime).toBe('2026-05-14T00:00:00.000Z')
    const day2 = getEntryByDate(userId, '2026-05-14')!
    expect(listTasksForEntry(day2.id)[0].startTime).toBe('2026-05-14T00:00:00.000Z')
    assertInvariants(userId, ['2026-05-13', '2026-05-14'])
  })
})

describe('autoCloseEntry — fill to expected, carve around breaks', () => {
  it('fills net worked time to expectedMinutes and never overlaps a break', () => {
    const userId = makeUser()
    const entry = makeEntry(userId, '2026-05-15', 120, '2026-05-15T09:00:00.000Z')
    // One short task and a break in the would-be extension window.
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-05-15T09:00:00.000Z', endTime: '2026-05-15T10:00:00.000Z', description: 'Work', tags: '[]' })
    createEntryBreak({ id: uuidv4(), entryId: entry.id, userId, breakStart: '2026-05-15T10:30:00.000Z', durationMinutes: 15, label: null, fromRuleId: null })

    autoCloseEntry(getEntryById(entry.id)!)

    const tasks = listTasksForEntry(entry.id)
    const breaks = getEntryBreaks(entry.id).map((b) => breakToInterval(b, '2026-05-15'))
    const net = sumWorkedMinutes(tasks, breaks)
    expect(net).toBe(120) // exactly the expected minutes
    expect(getEntryById(entry.id)!.endTime).toBeTruthy()
    assertInvariants(userId, ['2026-05-15'])
  })

  it('closes an abandoned active task without leaving it open', () => {
    const userId = makeUser()
    const entry = makeEntry(userId, '2026-05-16', 60, '2026-05-16T09:00:00.000Z')
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: '2026-05-16T09:00:00.000Z', description: 'Forgot to stop', tags: '[]' })

    autoCloseEntry(getEntryById(entry.id)!)

    const tasks = listTasksForEntry(entry.id)
    expect(tasks.every((t) => t.endTime)).toBe(true)
    assertInvariants(userId, ['2026-05-16'])
  })
})

describe('span invariants hold after a composed sequence of mutations', () => {
  it('stays consistent through create → break-carve → split → extend', () => {
    const userId = makeUser()
    const date = '2026-05-20'
    const entry = makeEntry(userId, date, 480, `${date}T08:00:00.000Z`)

    // A long task, then a break carved out of its middle, then another task.
    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: `${date}T08:00:00.000Z`, endTime: `${date}T12:00:00.000Z`, description: 'Morning', tags: '[]' })
    const breakId = uuidv4()
    createEntryBreak({ id: breakId, entryId: entry.id, userId, breakStart: `${date}T10:00:00.000Z`, durationMinutes: 30, label: null, fromRuleId: null })
    splitTasksAroundBreak(entry.id, userId, `${date}T10:00:00.000Z`, `${date}T10:30:00.000Z`)
    assertInvariants(userId, [date])

    createTask({ id: uuidv4(), entryId: entry.id, userId, startTime: `${date}T13:00:00.000Z`, endTime: `${date}T14:00:00.000Z`, description: 'Afternoon', tags: '[]' })
    assertInvariants(userId, [date])

    // Delete the break — the preceding span extends to fill it, clamped to the next span.
    const b = getEntryBreakById(breakId)!
    const { startIso, endIso } = breakToInterval(b, date)
    deleteEntryBreak(breakId)
    extendPreviousTaskOnBreakDelete(entry.id, startIso, endIso)
    assertInvariants(userId, [date])
  })
})
