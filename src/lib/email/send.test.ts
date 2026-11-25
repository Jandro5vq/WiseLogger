import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { sendEmail, isEmailEnabled } from './send'

const msg = {
  kind: 'password-reset',
  to: 'ana@example.com',
  subject: 'Asunto',
  html: '<p>token-secret-123</p>',
  text: 'token-secret-123',
}

describe('sendEmail', () => {
  const fetchMock = vi.fn()
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_key'
    process.env.EMAIL_FROM = 'WiseLogger <no-reply@wl.test>'
    fetchMock.mockReset()
    errorSpy.mockClear()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.RESEND_API_KEY
    delete process.env.EMAIL_FROM
  })

  it('is disabled unless both the key and the sender are set', () => {
    expect(isEmailEnabled()).toBe(true)
    delete process.env.EMAIL_FROM
    expect(isEmailEnabled()).toBe(false)
    process.env.EMAIL_FROM = 'x@wl.test'
    delete process.env.RESEND_API_KEY
    expect(isEmailEnabled()).toBe(false)
  })

  it('posts the message to the Resend API', async () => {
    fetchMock.mockResolvedValue(new Response('{"id":"1"}', { status: 200 }))
    const res = await sendEmail(msg)

    expect(res).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer re_test_key')
    expect(JSON.parse(init.body)).toEqual({
      from: 'WiseLogger <no-reply@wl.test>',
      to: ['ana@example.com'],
      subject: 'Asunto',
      html: msg.html,
      text: msg.text,
    })
  })

  it('does not call the API when disabled', async () => {
    delete process.env.RESEND_API_KEY
    expect(await sendEmail(msg)).toEqual({ ok: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports failure on a non-2xx answer without leaking the recipient or content', async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"bad"}', { status: 422 }))
    expect(await sendEmail(msg)).toEqual({ ok: false })
    const logged = errorSpy.mock.calls.flat().join(' ')
    expect(logged).toContain('422')
    expect(logged).toContain('password-reset')
    expect(logged).not.toContain('ana@example.com')
    expect(logged).not.toContain('token-secret-123')
    expect(logged).not.toContain('re_test_key')
  })

  it('never throws on a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    expect(await sendEmail(msg)).toEqual({ ok: false })
    expect(errorSpy).toHaveBeenCalled()
  })
})
