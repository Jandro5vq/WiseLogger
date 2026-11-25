import { describe, it, expect, beforeAll } from 'vitest'
import { invitationEmail, passwordChangedEmail, passwordResetEmail, testEmail } from './templates'

beforeAll(() => {
  process.env.BASE_URL = 'https://wl.test/'
})

const url = 'https://wl.test/reset-password?token=abc123'

describe('email templates', () => {
  it('invitation carries the link in html and text, with the expiry in the given zone', () => {
    const e = invitationEmail({ url, expiresAt: '2026-11-28T23:30:00.000Z', timezone: 'Europe/Madrid' })
    expect(e.subject).toMatch(/invitado/)
    expect(e.html).toContain(`href="${url}"`)
    expect(e.text).toContain(url)
    // 23:30 UTC is already the 29th in Madrid
    expect(e.text).toContain('29 de noviembre de 2026')
  })

  it('escapes the username', () => {
    const e = passwordResetEmail({ username: '<script>x</script>', url, expiresAt: new Date().toISOString(), timezone: 'UTC' })
    expect(e.html).not.toContain('<script>x')
    expect(e.html).toContain('&lt;script&gt;')
  })

  it('escapes the url inside attributes', () => {
    const e = passwordResetEmail({ username: 'Ana', url: 'https://wl.test/?a="><b>', expiresAt: new Date().toISOString(), timezone: 'UTC' })
    expect(e.html).not.toContain('"><b>')
  })

  it('uses the app brand and the public base url for the logo', () => {
    const e = testEmail({ username: 'Ana' })
    expect(e.html).toContain('WiseLogger')
    expect(e.html).toContain('Registro de jornada')
    expect(e.html).toContain('src="https://wl.test/icons/icon-192.png"')
    expect(e.html).toContain('prefers-color-scheme: dark')
  })

  it('password changed notice has no link to act on and survives an unknown timezone', () => {
    const e = passwordChangedEmail({ username: 'Ana', changedAt: '2026-11-25T10:00:00.000Z', timezone: 'Not/AZone' })
    expect(e.text).toContain('(UTC)')
    expect(e.html).not.toContain('class="wl-btn-link"')
  })
})
