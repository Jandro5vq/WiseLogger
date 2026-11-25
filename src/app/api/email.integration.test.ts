import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { v4 as uuidv4 } from 'uuid'
import type { NextRequest } from 'next/server'

// Email delivery through Resend (fetch stubbed): self-service reset, invitations,
// admin-issued links, password-changed notices and the admin test email.

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
  requireSession: vi.fn(),
  requireAdmin: vi.fn(),
}))

import { getSession, requireAdmin } from '@/lib/auth/session'
import { sqlite } from '@/lib/db'
import { createUser, updateUser } from '@/lib/db/queries/users'
import { hashPassword } from '@/lib/auth/password'
import { SELF_SERVICE_RESET_COOLDOWN_MS } from '@/lib/business/password-reset'
import { POST as forgotRoute } from '@/app/api/auth/forgot-password/route'
import { POST as resetRoute } from '@/app/api/auth/reset-password/route'
import { POST as changePasswordRoute } from '@/app/api/auth/change-password/route'
import { POST as invitationsRoute } from '@/app/api/admin/invitations/route'
import { POST as resetLinkRoute } from '@/app/api/admin/users/[id]/reset-link/route'
import { POST as testEmailRoute } from '@/app/api/admin/email/test/route'
import { GET as pendingRoute } from '@/app/api/admin/password-requests/route'

const PASSWORD = 'Secret123'
const fetchMock = vi.fn()

type Sent = { from: string; to: string[]; subject: string; html: string; text: string }
const sent = (): Sent[] => fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body))
const sentTo = (email: string) => sent().filter((m) => m.to.includes(email))

function enableEmail() {
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.EMAIL_FROM = 'WiseLogger <no-reply@wl.test>'
}
function disableEmail() {
  delete process.env.RESEND_API_KEY
  delete process.env.EMAIL_FROM
}

beforeAll(() => {
  process.env.DB_PATH = path.join(os.tmpdir(), `wl-email-${process.pid}-${Date.now()}.db`)
  process.env.SECRET_KEY = 'test-secret-key-test-secret-key-0123456789'
  process.env.ADMIN_EMAIL = 'admin@test.local'
  process.env.BASE_URL = 'https://wl.test/'
  const dir = path.join(process.cwd(), 'drizzle/migrations')
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(fs.readFileSync(path.join(dir, f), 'utf8'))
  }
  vi.stubGlobal('fetch', fetchMock)
})

afterAll(() => {
  vi.unstubAllGlobals()
  disableEmail()
})

function req(body: unknown): NextRequest {
  return new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}
const noBody = () => new Request('http://localhost/api', { method: 'POST' }) as unknown as NextRequest
const params = (id: string) => ({ params: { id } })

async function makeUser(username: string, role: 'admin' | 'user' = 'user'): Promise<string> {
  const id = uuidv4()
  createUser({
    id,
    username,
    email: `${username.toLowerCase()}@test.local`,
    passwordHash: await hashPassword(PASSWORD),
    role,
    createdAt: new Date().toISOString(),
  })
  return id
}

const tokenFrom = (text: string) => text.match(/token=([0-9a-f]{64})/)![1]

let adminId: string

beforeAll(async () => {
  adminId = await makeUser('Chief', 'admin')
})

beforeEach(() => {
  enableEmail()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => new Response('{"id":"x"}', { status: 200 }))
  vi.mocked(requireAdmin).mockResolvedValue({
    user: { id: adminId, role: 'admin', timezone: 'Europe/Madrid' },
  } as Awaited<ReturnType<typeof requireAdmin>>)
})

describe('self-service password reset', () => {
  it('emails a working link straight away, with the same answer for unknown accounts', async () => {
    const id = await makeUser('Selfie')

    const known = await forgotRoute(req({ identifier: 'selfie' }))
    const unknown = await forgotRoute(req({ identifier: 'nobody-at-all' }))
    expect(await known.json()).toEqual(await unknown.json())

    await vi.waitFor(() => expect(sentTo('selfie@test.local')).toHaveLength(1))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const mail = sentTo('selfie@test.local')[0]
    expect(mail.subject).toMatch(/Restablece/)
    expect(mail.text).toContain('https://wl.test/reset-password?token=')

    // No admin request is queued in self-service mode
    const pending = (await (await pendingRoute()).json()) as { userId: string }[]
    expect(pending.some((p) => p.userId === id)).toBe(false)

    // The emailed link resets the password, and that sends the security notice
    fetchMock.mockClear()
    const res = await resetRoute(req({ token: tokenFrom(mail.text), password: 'NewSecret9' }))
    expect(res.status).toBe(200)
    await vi.waitFor(() => expect(sentTo('selfie@test.local')).toHaveLength(1))
    expect(sentTo('selfie@test.local')[0].subject).toMatch(/ha cambiado/)
  })

  it('throttles repeated requests for the same account', async () => {
    const id = await makeUser('Spammed')
    await forgotRoute(req({ identifier: 'spammed' }))
    await forgotRoute(req({ identifier: 'SPAMMED@test.local' }))
    await vi.waitFor(() => expect(sentTo('spammed@test.local')).toHaveLength(1))
    await new Promise((r) => setTimeout(r, 20))
    expect(sentTo('spammed@test.local')).toHaveLength(1)

    // Once the cooldown has passed a new link goes out
    sqlite
      .prepare('UPDATE password_reset_tokens SET created_at = ? WHERE user_id = ?')
      .run(new Date(Date.now() - SELF_SERVICE_RESET_COOLDOWN_MS - 1000).toISOString(), id)
    await forgotRoute(req({ identifier: 'spammed' }))
    await vi.waitFor(() => expect(sentTo('spammed@test.local')).toHaveLength(2))
  })

  it('an admin-issued link does not block a self-service request', async () => {
    const id = await makeUser('Mixed')
    await resetLinkRoute(noBody(), params(id))
    fetchMock.mockClear()
    await forgotRoute(req({ identifier: 'mixed' }))
    await vi.waitFor(() => expect(sentTo('mixed@test.local')).toHaveLength(1))
  })

  it('sends nothing for suspended accounts', async () => {
    const id = await makeUser('Paused')
    updateUser(id, { isActive: false })
    await forgotRoute(req({ identifier: 'paused' }))
    await new Promise((r) => setTimeout(r, 20))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a failing provider does not break the request', async () => {
    await makeUser('Unlucky')
    vi.spyOn(console, 'error').mockImplementationOnce(() => {})
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }))
    const res = await forgotRoute(req({ identifier: 'unlucky' }))
    expect(res.status).toBe(200)
  })

  it('falls back to an admin request when email is not configured', async () => {
    disableEmail()
    const id = await makeUser('Offline')
    const res = await forgotRoute(req({ identifier: 'offline' }))
    expect((await res.json()).message).toMatch(/administrador/)
    const pending = (await (await pendingRoute()).json()) as { userId: string }[]
    expect(pending.some((p) => p.userId === id)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('admin actions', () => {
  it('emails an invitation to the given address', async () => {
    const res = await invitationsRoute(req({ email: ' new.person@test.local ' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.emailSent).toBe(true)
    expect(body.registrationUrl).toMatch(/^https:\/\/wl\.test\/register\?token=[0-9a-f]{64}$/)
    const [mail] = sentTo('new.person@test.local')
    expect(mail.html).toContain(body.registrationUrl)
  })

  it('does not email an invitation without an address, or when email is off', async () => {
    expect((await (await invitationsRoute(req({}))).json()).emailSent).toBe(false)
    disableEmail()
    expect((await (await invitationsRoute(req({ email: 'x@test.local' }))).json()).emailSent).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports a failed invitation email so the admin can copy the link', async () => {
    vi.spyOn(console, 'error').mockImplementationOnce(() => {})
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 422 }))
    const body = await (await invitationsRoute(req({ email: 'bounce@test.local' }))).json()
    expect(body.emailSent).toBe(false)
    expect(body.registrationUrl).toBeTruthy()
  })

  it('emails the admin-issued reset link', async () => {
    const id = await makeUser('Helped')
    const body = await (await resetLinkRoute(noBody(), params(id))).json()
    expect(body.emailSent).toBe(true)
    expect(sentTo('helped@test.local')[0].text).toContain(body.url)
  })

  it('test email: admin only, needs configuration, goes to the admin', async () => {
    vi.mocked(requireAdmin).mockRejectedValueOnce(new Error('Forbidden'))
    expect((await testEmailRoute()).status).toBe(403)

    const ok = await testEmailRoute()
    expect(ok.status).toBe(200)
    expect(sentTo('chief@test.local')).toHaveLength(1)

    vi.spyOn(console, 'error').mockImplementationOnce(() => {})
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 403 }))
    expect((await testEmailRoute()).status).toBe(502)

    disableEmail()
    expect((await testEmailRoute()).status).toBe(400)
  })
})

describe('change password', () => {
  it('sends the security notice', async () => {
    const id = await makeUser('Changer')
    vi.mocked(getSession).mockResolvedValue({
      user: { id, role: 'user' },
    } as Awaited<ReturnType<typeof getSession>>)
    const res = await changePasswordRoute(req({ oldPassword: PASSWORD, newPassword: 'NewSecret9' }))
    expect(res.status).toBe(200)
    await vi.waitFor(() => expect(sentTo('changer@test.local')).toHaveLength(1))
  })
})
