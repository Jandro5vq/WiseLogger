import { describe, it, expect } from 'vitest'
import { hhmmToUTC, dateStringInTz, addDateStr, localMidnightUtcMs, splitAtMidnights } from './tz'

// Use DST-free zones so the expected offsets are stable year-round:
//   America/Bogota = UTC-5, Asia/Kolkata = UTC+5:30
describe('hhmmToUTC', () => {
  it('converts UTC local time unchanged', () => {
    expect(hhmmToUTC('2026-06-14', '00:00', 'UTC')).toBe('2026-06-14T00:00:00.000Z')
    expect(hhmmToUTC('2026-06-14', '09:30', 'UTC')).toBe('2026-06-14T09:30:00.000Z')
  })

  it('converts a negative-offset zone (Bogota, UTC-5)', () => {
    // local midnight in Bogota is 05:00 UTC the same date
    expect(hhmmToUTC('2026-06-14', '00:00', 'America/Bogota')).toBe('2026-06-14T05:00:00.000Z')
  })

  it('converts a fractional positive-offset zone (Kolkata, UTC+5:30)', () => {
    // 09:30 IST == 04:00 UTC
    expect(hhmmToUTC('2026-06-14', '09:30', 'Asia/Kolkata')).toBe('2026-06-14T04:00:00.000Z')
  })
})

describe('dateStringInTz', () => {
  it('rolls back a day for an early-UTC instant in a negative-offset zone', () => {
    // 02:00 UTC == 21:00 previous day in Bogota
    expect(dateStringInTz(new Date('2026-06-14T02:00:00Z'), 'America/Bogota')).toBe('2026-06-13')
  })

  it('rolls forward a day for a late-UTC instant in a positive-offset zone', () => {
    // 20:00 UTC + 5:30 == 01:30 next day in Kolkata
    expect(dateStringInTz(new Date('2026-06-14T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-06-15')
  })

  it('defaults to UTC', () => {
    expect(dateStringInTz(new Date('2026-06-14T23:59:59Z'))).toBe('2026-06-14')
  })
})

describe('addDateStr', () => {
  it('adds and subtracts days, crossing month boundaries', () => {
    expect(addDateStr('2026-06-14', 1)).toBe('2026-06-15')
    expect(addDateStr('2026-06-30', 1)).toBe('2026-07-01')
    expect(addDateStr('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('localMidnightUtcMs', () => {
  it('returns the UTC instant of local midnight', () => {
    expect(localMidnightUtcMs('2026-06-14', 'America/Bogota')).toBe(
      Date.parse('2026-06-14T05:00:00Z')
    )
    expect(localMidnightUtcMs('2026-06-14', 'UTC')).toBe(Date.parse('2026-06-14T00:00:00Z'))
  })
})

describe('splitAtMidnights', () => {
  it('returns a single segment for a task within one day', () => {
    const segs = splitAtMidnights('2026-06-14T09:00:00Z', '2026-06-14T10:00:00Z', 'UTC')
    expect(segs).toHaveLength(1)
    expect(segs[0]).toEqual({
      dateStr: '2026-06-14',
      startIso: '2026-06-14T09:00:00.000Z',
      endIso: '2026-06-14T10:00:00.000Z',
    })
  })

  it('splits a task crossing UTC midnight into two day segments', () => {
    const segs = splitAtMidnights('2026-06-14T23:00:00Z', '2026-06-15T01:00:00Z', 'UTC')
    expect(segs).toEqual([
      { dateStr: '2026-06-14', startIso: '2026-06-14T23:00:00.000Z', endIso: '2026-06-15T00:00:00.000Z' },
      { dateStr: '2026-06-15', startIso: '2026-06-15T00:00:00.000Z', endIso: '2026-06-15T01:00:00.000Z' },
    ])
  })

  it('splits at local midnight for a negative-offset zone (Bogota)', () => {
    // 22:00 → 02:00 Bogota local == 03:00Z → 07:00Z, midnight Bogota = 05:00Z
    const segs = splitAtMidnights('2026-06-15T03:00:00Z', '2026-06-15T07:00:00Z', 'America/Bogota')
    expect(segs).toEqual([
      { dateStr: '2026-06-14', startIso: '2026-06-15T03:00:00.000Z', endIso: '2026-06-15T05:00:00.000Z' },
      { dateStr: '2026-06-15', startIso: '2026-06-15T05:00:00.000Z', endIso: '2026-06-15T07:00:00.000Z' },
    ])
  })

  it('splits a multi-day task into one segment per day', () => {
    const segs = splitAtMidnights('2026-06-14T22:00:00Z', '2026-06-16T03:00:00Z', 'UTC')
    expect(segs.map((s) => s.dateStr)).toEqual(['2026-06-14', '2026-06-15', '2026-06-16'])
  })

  it('returns [] when end is not after start', () => {
    expect(splitAtMidnights('2026-06-14T10:00:00Z', '2026-06-14T10:00:00Z', 'UTC')).toEqual([])
  })
})
