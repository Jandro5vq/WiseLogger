import { describe, it, expect, beforeAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { v4 as uuidv4 } from 'uuid'
import { NextRequest } from 'next/server'

import { sqlite } from '@/lib/db'
import { createUser, updateUser } from '@/lib/db/queries/users'
import { signToken } from '@/lib/auth/jwt'
import { COOKIE_NAME } from '@/lib/auth/cookies'
import { getSession } from '@/lib/auth/session'

beforeAll(() => {
  process.env.DB_PATH = path.join(os.tmpdir(), `wl-session-${process.pid}-${Date.now()}.db`)
  process.env.SECRET_KEY = 'test-secret-key-test-secret-key-0123456789'
  process.env.ADMIN_EMAIL = 'admin@test.local'
  const dir = path.join(process.cwd(), 'drizzle/migrations')
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(fs.readFileSync(path.join(dir, f), 'utf8'))
  }
})

describe('getSession', () => {
  it('rejects soft-deleted users even with a valid token', async () => {
    const id = uuidv4()
    createUser({ id, username: 'Sess', email: 'sess@t.l', passwordHash: 'x', createdAt: new Date().toISOString() })
    const token = await signToken({ sub: id, username: 'Sess', role: 'user' })
    const request = () => new NextRequest('http://localhost/', { headers: { cookie: `${COOKIE_NAME}=${token}` } })

    const session = await getSession(request())
    expect(session?.user.id).toBe(id)
    expect(session?.user).not.toHaveProperty('deletedAt')

    // Only deleted_at is set (validSince untouched) to isolate the check
    updateUser(id, { deletedAt: new Date().toISOString() })
    expect(await getSession(request())).toBeNull()
  })
})
