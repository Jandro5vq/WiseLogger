import { describe, it, expect } from 'vitest'
import {
  netTaskMinutes,
  breakOverlapMs,
  taskWorkedMinutes,
  sumWorkedMinutes,
  type BreakInterval,
} from './break-math'

// Fixed UTC timestamps keep these tests independent of the machine timezone.
const D = '2026-06-14'
const at = (hms: string) => `${D}T${hms}.000Z`
const brk = (startHms: string, endHms: string): BreakInterval => ({
  startIso: at(startHms),
  endIso: at(endHms),
})

describe('netTaskMinutes', () => {
  it('returns the full duration when there are no breaks', () => {
    expect(netTaskMinutes(at('09:00:00'), at('10:00:00'), [])).toBe(60)
  })

  it('subtracts a break fully contained in the task', () => {
    expect(netTaskMinutes(at('09:00:00'), at('10:00:00'), [brk('09:30:00', '09:45:00')])).toBe(45)
  })

  it('returns 0 when the task is fully inside a break', () => {
    expect(netTaskMinutes(at('09:30:00'), at('09:40:00'), [brk('09:00:00', '10:00:00')])).toBe(0)
  })

  it('only counts the overlapping part of a break that starts before the task', () => {
    expect(netTaskMinutes(at('09:00:00'), at('10:00:00'), [brk('08:30:00', '09:15:00')])).toBe(45)
  })

  it('ignores breaks that do not overlap the task', () => {
    expect(netTaskMinutes(at('09:00:00'), at('10:00:00'), [brk('11:00:00', '11:30:00')])).toBe(60)
  })

  it('subtracts multiple overlapping breaks', () => {
    const breaks = [brk('09:10:00', '09:20:00'), brk('09:40:00', '09:50:00')]
    expect(netTaskMinutes(at('09:00:00'), at('10:00:00'), breaks)).toBe(40)
  })

  it('returns a precise (unrounded) float', () => {
    // 84 seconds = 1.4 minutes
    expect(netTaskMinutes(at('09:00:00'), at('09:01:24'), [])).toBeCloseTo(1.4, 5)
  })
})

describe('breakOverlapMs', () => {
  const start = new Date(at('09:00:00')).getTime()
  const end = new Date(at('10:00:00')).getTime()

  it('measures the overlapping milliseconds of a break in the middle', () => {
    expect(breakOverlapMs(start, end, [brk('09:30:00', '09:45:00')])).toBe(15 * 60_000)
  })

  it('returns 0 for a break that only touches the edge', () => {
    expect(breakOverlapMs(start, end, [brk('10:00:00', '10:30:00')])).toBe(0)
  })
})

describe('taskWorkedMinutes (rounded per segment)', () => {
  it('rounds 1.4 minutes down to 1', () => {
    expect(taskWorkedMinutes(at('09:00:00'), at('09:01:24'), [])).toBe(1) // 84s
  })

  it('rounds 1.5 minutes up to 2', () => {
    expect(taskWorkedMinutes(at('09:00:00'), at('09:01:30'), [])).toBe(2) // 90s
  })

  it('rounds a sub-30s segment to 0', () => {
    expect(taskWorkedMinutes(at('09:00:00'), at('09:00:20'), [])).toBe(0)
  })
})

describe('sumWorkedMinutes', () => {
  it('ignores active tasks that have no endTime', () => {
    const tasks = [
      { startTime: at('09:00:00'), endTime: at('10:00:00') },
      { startTime: at('10:00:00'), endTime: null }, // active
    ]
    expect(sumWorkedMinutes(tasks, [])).toBe(60)
  })

  it('equals the sum of each segment rounded individually (rows reconcile with the total)', () => {
    // Three 84s tasks: each rounds to 1m. The displayed rows are 1+1+1 = 3,
    // and the total must also be 3 — never the round of the float sum (4.2 → 4).
    const tasks = [
      { startTime: at('09:00:00'), endTime: at('09:01:24') },
      { startTime: at('10:00:00'), endTime: at('10:01:24') },
      { startTime: at('11:00:00'), endTime: at('11:01:24') },
    ]
    const rowsSum = tasks.reduce(
      (s, t) => s + taskWorkedMinutes(t.startTime, t.endTime!, []),
      0
    )
    expect(sumWorkedMinutes(tasks, [])).toBe(3)
    expect(sumWorkedMinutes(tasks, [])).toBe(rowsSum)
  })

  it('subtracts breaks per segment', () => {
    const tasks = [
      { startTime: at('09:00:00'), endTime: at('10:00:00') }, // 60, minus 15 break = 45
      { startTime: at('10:00:00'), endTime: at('11:00:00') }, // 60
    ]
    expect(sumWorkedMinutes(tasks, [brk('09:30:00', '09:45:00')])).toBe(105)
  })

  it('returns 0 for an empty task list', () => {
    expect(sumWorkedMinutes([], [])).toBe(0)
  })
})
