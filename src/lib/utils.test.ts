import { describe, it, expect } from 'vitest'
import { formatMinutes, formatElapsed } from './utils'

describe('formatMinutes', () => {
  it('formats sub-hour values as minutes', () => {
    expect(formatMinutes(0)).toBe('0m')
    expect(formatMinutes(5)).toBe('5m')
    expect(formatMinutes(59)).toBe('59m')
  })

  it('formats hours with zero-padded minutes', () => {
    expect(formatMinutes(60)).toBe('1h 00m')
    expect(formatMinutes(65)).toBe('1h 05m')
    expect(formatMinutes(90)).toBe('1h 30m')
    expect(formatMinutes(495)).toBe('8h 15m')
  })

  it('rounds to the nearest minute', () => {
    expect(formatMinutes(1.4)).toBe('1m')
    expect(formatMinutes(1.6)).toBe('2m')
  })

  it('renders negative balances with a leading sign', () => {
    expect(formatMinutes(-30)).toBe('-30m')
    expect(formatMinutes(-90)).toBe('-1h 30m')
  })
})

describe('formatElapsed', () => {
  it('formats mm:ss under an hour', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(65_000)).toBe('01:05')
    expect(formatElapsed(59_000)).toBe('00:59')
  })

  it('formats h:mm:ss at or over an hour', () => {
    expect(formatElapsed(3_661_000)).toBe('1:01:01')
    expect(formatElapsed(3_600_000)).toBe('1:00:00')
  })

  it('floors partial seconds', () => {
    expect(formatElapsed(1_999)).toBe('00:01')
  })
})
