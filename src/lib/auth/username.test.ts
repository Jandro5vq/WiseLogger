import { describe, it, expect } from 'vitest'
import { normalizeEmail, normalizeUsername, usernameKey, validateEmail, validateUsername } from './username'

describe('normalizeUsername', () => {
  it('trims and upper-cases the first letter, keeping the rest as typed', () => {
    expect(normalizeUsername('  juan ')).toBe('Juan')
    expect(normalizeUsername('ana.García')).toBe('Ana.García')
    expect(normalizeUsername('íñigo')).toBe('Íñigo')
    expect(normalizeUsername('')).toBe('')
  })
})

describe('validateUsername', () => {
  it('accepts letters (with accents), digits and . _ -', () => {
    for (const u of ['Juan', 'Íñigo', 'Ana.garcia', 'Pepe_2', 'Mar-ia', 'Abc']) {
      expect(validateUsername(u), u).toBeNull()
    }
  })

  it('rejects spaces, a leading non-letter, bad chars and bad lengths', () => {
    expect(validateUsername('Juan Perez')).toMatch(/espacios/)
    expect(validateUsername('2pac')).toMatch(/empezar por una letra/)
    expect(validateUsername('.juan')).toMatch(/empezar por una letra/)
    expect(validateUsername('Ju')).toMatch(/al menos 3/)
    expect(validateUsername('A'.repeat(31))).toMatch(/más de 30/)
    expect(validateUsername('A'.repeat(30))).toBeNull()
    expect(validateUsername('Juan@x')).toMatch(/solo puede contener/)
    expect(validateUsername('')).toMatch(/obligatorio/)
  })
})

describe('usernameKey', () => {
  it('folds case beyond ASCII', () => {
    expect(usernameKey(' ÍÑIGO ')).toBe(usernameKey('íñigo'))
  })
})

describe('email', () => {
  it('normalizes and validates', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com')
    expect(validateEmail('foo@bar.com')).toBeNull()
    expect(validateEmail('foo bar@x.com')).not.toBeNull()
    expect(validateEmail('nope')).not.toBeNull()
  })
})
