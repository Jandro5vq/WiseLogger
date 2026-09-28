import { describe, it, expect } from 'vitest'
import { parseTimeInput, shiftTime, incompleteTimeError } from '@/lib/time-mask'

describe('parseTimeInput', () => {
  it.each([
    ['9', '09:00'],
    ['0', '00:00'],
    ['14', '14:00'],
    ['930', '09:30'],
    ['1430', '14:30'],
    ['2359', '23:59'],
    ['9:5', '09:05'],
    ['9:30', '09:30'],
    ['09:30', '09:30'],
    ['9.30', '09:30'],
    ['9,30', '09:30'],
    ['9h30', '09:30'],
    ['9H30', '09:30'],
    ['9 30', '09:30'],
    ['14h', '14:00'],
    ['9:', '09:00'],
    ['  7  ', '07:00'],
  ])('%j → %s', (raw, expected) => {
    expect(parseTimeInput(raw)).toBe(expected)
  })

  it.each(['', '   ', '25', '2400', '9:75', '12:60', '960', 'abc', '1:2:3', '12345', '9:300'])(
    '%j is invalid',
    (raw) => {
      expect(parseTimeInput(raw)).toBeNull()
    }
  )
})

describe('shiftTime', () => {
  it('adds and subtracts minutes', () => {
    expect(shiftTime('09:30', 1)).toBe('09:31')
    expect(shiftTime('09:30', -15)).toBe('09:15')
    expect(shiftTime('09:59', 1)).toBe('10:00')
  })

  it('wraps around midnight', () => {
    expect(shiftTime('23:59', 1)).toBe('00:00')
    expect(shiftTime('00:00', -15)).toBe('23:45')
  })
})

describe('incompleteTimeError', () => {
  it('accepts empty and complete values', () => {
    expect(incompleteTimeError('2026-09-28T09:30', '')).toBeNull()
    expect(incompleteTimeError('', '2026-09-28T17:00')).toBeNull()
  })

  it('flags invalid start/end text', () => {
    expect(incompleteTimeError('2026-09-28T25', '')).toMatch(/inicio/)
    expect(incompleteTimeError('2026-09-28T09:00', '2026-09-28Tabc')).toMatch(/fin/)
  })
})
