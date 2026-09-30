import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { v4 as uuidv4 } from 'uuid'
import type { NextRequest } from 'next/server'

// Registration validation, admin user edits, soft delete/restore/purge and the
// admin-mediated password reset flow.

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
  requireSession: vi.fn(),
  requireAdmin: vi.fn(),
}))

import { requireAdmin } from '@/lib/auth/session'
import { sqlite } from '@/lib/db'
import { createUser, getUserById, getUserByUsername } from '@/lib/db/queries/users'
import { createInvitation } from '@/lib/db/queries/invitations'
import { createEntry } from '@/lib/db/queries/entries'
import { hashPassword } from '@/lib/auth/password'
import { purgeDeletedUsers } from '@/lib/business/user-lifecycle'
import { computeActivitySummary } from '@/lib/business/admin-activity'
import { POST as registerRoute } from '@/app/api/register/route'
import { POST as loginRoute } from '@/app/api/auth/login/route'
import { POST as forgotRoute } from '@/app/api/auth/forgot-password/route'
import { POST as resetRoute } from '@/app/api/auth/reset-password/route'
import { PATCH as adminPatchRoute, DELETE as adminDeleteRoute } from '@/app/api/admin/users/[id]/route'
import { POST as restoreRoute } from '@/app/api/admin/users/[id]/restore/route'
import { POST as resetLinkRoute } from '@/app/api/admin/users/[id]/reset-link/route'
import { GET as pendingRoute } from '@/app/api/admin/password-requests/route'

const PASSWORD = 'Secret123'

beforeAll(() => {
  process.env.DB_PATH = path.join(os.tmpdir(), `wl-users-${process.pid}-${Date.now()}.db`)
  process.env.SECRET_KEY = 'test-secret-key-test-secret-key-0123456789'
  process.env.ADMIN_EMAIL = 'admin@test.local'
  process.env.BASE_URL = 'https://wl.test/'
  const dir = path.join(process.cwd(), 'drizzle/migrations')
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(fs.readFileSync(path.join(dir, f), 'utf8'))
  }
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

let adminId: string

async function makeUser(username: string, opts: { role?: 'admin' | 'user' } = {}): Promise<string> {
  const id = uuidv4()
  createUser({
    id,
    username,
    email: `${username.toLowerCase()}@test.local`,
    passwordHash: await hashPassword(PASSWORD),
    role: opts.role ?? 'user',
    createdAt: new Date().toISOString(),
  })
  return id
}

function invite(email?: string): string {
  const token = uuidv4()
  createInvitation({ id: uuidv4(), token, email, createdBy: adminId, expiresAt: new Date(Date.now() + 3_600_000).toISOString() })
  return token
}

beforeAll(async () => {
  adminId = await makeUser('Boss', { role: 'admin' })
})

beforeEach(() => {
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: adminId, role: 'admin' } } as Awaited<ReturnType<typeof requireAdmin>>)
})

describe('register', () => {
  it('normalizes the username (trim + capitalized) and email', async () => {
    const res = await registerRoute(req({ token: invite(), username: '  pepe ', email: ' Pepe@Test.Local ', password: PASSWORD }))
    expect(res.status).toBe(201)
    const u = getUserByUsername('pepe')!
    expect(u.username).toBe('Pepe')
    expect(u.email).toBe('pepe@test.local')
  })

  it('rejects usernames with inner spaces or invalid characters', async () => {
    for (const username of ['juan perez', '1abc', 'ab', 'a$b']) {
      const res = await registerRoute(req({ token: invite(), username, email: `${uuidv4()}@test.local`, password: PASSWORD }))
      expect(res.status, username).toBe(400)
    }
  })

  it('rejects a duplicate username regardless of case, and invalid emails', async () => {
    await makeUser('Lucia')
    let res = await registerRoute(req({ token: invite(), username: 'LUCIA', email: 'other@test.local', password: PASSWORD }))
    expect(res.status).toBe(409)
    res = await registerRoute(req({ token: invite(), username: 'Nueva', email: 'not-an-email', password: PASSWORD }))
    expect(res.status).toBe(400)
  })

  it('rejects passwords with surrounding spaces', async () => {
    const res = await registerRoute(req({ token: invite(), username: 'Espacio', email: 'esp@test.local', password: ` ${PASSWORD}` }))
    expect(res.status).toBe(400)
  })
})

describe('login', () => {
  it('is case-insensitive and ignores surrounding spaces in the username', async () => {
    await makeUser('Marta')
    expect((await loginRoute(req({ username: 'marta', password: PASSWORD }))).status).toBe(200)
    expect((await loginRoute(req({ username: ' MARTA ', password: PASSWORD }))).status).toBe(200)
  })

  it('finds non-ASCII usernames case-insensitively', async () => {
    await makeUser('Íñigo')
    expect((await loginRoute(req({ username: 'íñigo', password: PASSWORD }))).status).toBe(200)
  })
})

describe('admin edits username and email', () => {
  it('normalizes, validates and enforces uniqueness', async () => {
    const id = await makeUser('Editme')
    await makeUser('Taken')

    let res = await adminPatchRoute(req({ username: ' renamed', email: 'NEW@test.local' }), params(id))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ username: 'Renamed', email: 'new@test.local' })

    res = await adminPatchRoute(req({ username: 'taken' }), params(id))
    expect(res.status).toBe(409)
    res = await adminPatchRoute(req({ username: 'has space' }), params(id))
    expect(res.status).toBe(400)
    res = await adminPatchRoute(req({ email: 'bad' }), params(id))
    expect(res.status).toBe(400)
    res = await adminPatchRoute(req({}), params(id))
    expect(res.status).toBe(400)

    // Keeping your own username (any case) is not a conflict
    res = await adminPatchRoute(req({ username: 'RENAMED' }), params(id))
    expect(res.status).toBe(200)
  })

  it('requires admin', async () => {
    vi.mocked(requireAdmin).mockRejectedValueOnce(new Error('Forbidden'))
    const res = await adminPatchRoute(req({ username: 'Xyz' }), params(adminId))
    expect(res.status).toBe(403)
  })
})

describe('soft delete', () => {
  it('blocks login, keeps the name reserved, and can be restored', async () => {
    const id = await makeUser('Gone')
    expect((await adminDeleteRoute(noBody(), params(id))).status).toBe(200)
    expect(getUserById(id)!.deletedAt).not.toBeNull()

    expect((await loginRoute(req({ username: 'gone', password: PASSWORD }))).status).toBe(401)
    const reg = await registerRoute(req({ token: invite(), username: 'gone', email: 'x-gone@test.local', password: PASSWORD }))
    expect(reg.status).toBe(409)
    expect((await reg.json()).error).toMatch(/cuenta eliminada/)
    expect((await adminDeleteRoute(noBody(), params(id))).status).toBe(409)

    expect((await restoreRoute(noBody(), params(id))).status).toBe(200)
    expect(getUserById(id)!.deletedAt).toBeNull()
    expect((await loginRoute(req({ username: 'gone', password: PASSWORD }))).status).toBe(200)
  })

  it('refuses to delete yourself or the last admin', async () => {
    expect((await adminDeleteRoute(noBody(), params(adminId))).status).toBe(400)

    // Another admin tries to delete Boss while Boss is the only other admin → allowed;
    // then deleting the acting admin's peer when it's the last one → refused.
    const other = await makeUser('Second', { role: 'admin' })
    vi.mocked(requireAdmin).mockResolvedValue({ user: { id: other, role: 'admin' } } as Awaited<ReturnType<typeof requireAdmin>>)
    expect((await adminDeleteRoute(noBody(), params(adminId))).status).toBe(200)
    // Only `other` is left: nobody may delete it
    vi.mocked(requireAdmin).mockResolvedValue({ user: { id: uuidv4(), role: 'admin' } } as Awaited<ReturnType<typeof requireAdmin>>)
    const last = await adminDeleteRoute(noBody(), params(other))
    expect(last.status).toBe(400)
    expect((await last.json()).error).toMatch(/último administrador/)

    vi.mocked(requireAdmin).mockResolvedValue({ user: { id: other, role: 'admin' } } as Awaited<ReturnType<typeof requireAdmin>>)
    expect((await restoreRoute(noBody(), params(adminId))).status).toBe(200)
  })

  it('hides deleted users from the activity summary', async () => {
    const id = await makeUser('Hidden')
    await adminDeleteRoute(noBody(), params(id))
    const summary = computeActivitySummary('2026-01-01', '2026-12-31')
    expect(summary.users.some((u) => u.id === id)).toBe(false)
  })

  it('purges only users past the retention period, with their data and invitations', async () => {
    const old = await makeUser('Oldone', { role: 'admin' })
    const recent = await makeUser('Recent')
    createEntry({ id: uuidv4(), userId: old, date: '2026-01-05', expectedMinutes: 480 })
    // `old` created an invitation and used another one: both FKs lack ON DELETE CASCADE
    createInvitation({ id: uuidv4(), token: uuidv4(), createdBy: old, expiresAt: new Date().toISOString() })
    const usedTok = invite()
    sqlite.prepare('UPDATE invitations SET used_by = ?, used_at = ? WHERE token = ?').run(old, new Date().toISOString(), usedTok)

    const longAgo = new Date(Date.now() - 31 * 24 * 3_600_000).toISOString()
    sqlite.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').run(longAgo, old)
    sqlite.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), recent)

    expect(purgeDeletedUsers()).toBe(1)
    expect(getUserById(old)).toBeUndefined()
    expect(getUserById(recent)).toBeDefined()
    expect(sqlite.prepare('SELECT count(*) AS n FROM entries WHERE user_id = ?').get(old)).toEqual({ n: 0 })
    expect(sqlite.prepare('SELECT used_by FROM invitations WHERE token = ?').get(usedTok)).toEqual({ used_by: null })
  })
})

describe('password reset via admin', () => {
  it('request → admin link → single-use reset', async () => {
    const id = await makeUser('Forgetful')

    // Same answer for existing and unknown accounts
    const known = await forgotRoute(req({ identifier: ' forgetful ' }))
    const unknown = await forgotRoute(req({ identifier: 'nobody-here' }))
    expect(known.status).toBe(200)
    expect(await known.json()).toEqual(await unknown.json())
    // Asking twice keeps a single open request; lookup by email works too
    await forgotRoute(req({ identifier: 'FORGETFUL@test.local' }))
    const pending = (await (await pendingRoute()).json()) as { userId: string }[]
    expect(pending.filter((p) => p.userId === id)).toHaveLength(1)

    const linkRes = await resetLinkRoute(noBody(), params(id))
    expect(linkRes.status).toBe(200)
    const { url, expiresAt } = await linkRes.json()
    expect(url).toMatch(/^https:\/\/wl\.test\/reset-password\?token=[0-9a-f]{64}$/)
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now())
    const pendingAfter = (await (await pendingRoute()).json()) as { userId: string }[]
    expect(pendingAfter.some((p) => p.userId === id)).toBe(false)

    const token = new URL(url).searchParams.get('token')!
    const before = getUserById(id)!.validSince

    expect((await resetRoute(req({ token, password: 'weak' }))).status).toBe(400)
    expect((await resetRoute(req({ token, password: 'NewSecret9' }))).status).toBe(200)
    expect(getUserById(id)!.validSince > before).toBe(true)
    expect((await loginRoute(req({ username: 'forgetful', password: 'NewSecret9' }))).status).toBe(200)

    // Single use
    expect((await resetRoute(req({ token, password: 'Another99' }))).status).toBe(400)
  })

  it('rejects expired, superseded and unknown tokens', async () => {
    const id = await makeUser('Expiry')
    const first = new URL((await (await resetLinkRoute(noBody(), params(id))).json()).url).searchParams.get('token')!
    const second = new URL((await (await resetLinkRoute(noBody(), params(id))).json()).url).searchParams.get('token')!
    // Issuing a new link supersedes the old one
    expect((await resetRoute(req({ token: first, password: 'NewSecret9' }))).status).toBe(400)

    sqlite.prepare('UPDATE password_reset_tokens SET expires_at = ? WHERE user_id = ? AND used_at IS NULL')
      .run(new Date(Date.now() - 1000).toISOString(), id)
    expect((await resetRoute(req({ token: second, password: 'NewSecret9' }))).status).toBe(400)
    expect((await resetRoute(req({ token: 'f'.repeat(64), password: 'NewSecret9' }))).status).toBe(400)
  })

  it('deleting a user voids their pending link', async () => {
    const id = await makeUser('Voided')
    const token = new URL((await (await resetLinkRoute(noBody(), params(id))).json()).url).searchParams.get('token')!
    await adminDeleteRoute(noBody(), params(id))
    await restoreRoute(noBody(), params(id))
    expect((await resetRoute(req({ token, password: 'NewSecret9' }))).status).toBe(400)
  })
})
