import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { verifyToken, type JwtPayload } from '@/lib/auth/jwt'
import { COOKIE_NAME } from '@/lib/auth/cookies'
import { db } from '@/lib/db'
import { users } from '@db/schema'
import { eq } from 'drizzle-orm'

export interface Session {
  user: {
    id: string
    username: string
    email: string
    role: 'admin' | 'user'
    isActive: boolean
    timezone: string
  }
  payload: JwtPayload
}

export async function getSession(req?: NextRequest): Promise<Session | null> {
  let token: string | undefined

  if (req) {
    token = req.cookies.get(COOKIE_NAME)?.value
  } else {
    const cookieStore = await cookies()
    token = cookieStore.get(COOKIE_NAME)?.value
  }

  if (!token) return null

  const payload = await verifyToken(token)
  if (!payload) return null

  const user = db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      timezone: users.timezone,
      validSince: users.validSince,
    })
    .from(users)
    .where(eq(users.id, payload.sub))
    .get()

  if (!user || !user.isActive) return null

  // Revocation check: reject tokens issued before validSince
  if (payload.iat != null && new Date(payload.iat * 1000) < new Date(user.validSince)) {
    return null
  }

  return { user, payload }
}

export async function requireSession(req?: NextRequest): Promise<Session> {
  const session = await getSession(req)
  if (!session) throw new Error('Unauthorized')
  return session
}

export async function requireAdmin(req?: NextRequest): Promise<Session> {
  const session = await requireSession(req)
  if (session.user.role !== 'admin') throw new Error('Forbidden')
  return session
}
