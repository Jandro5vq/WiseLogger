export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken, signToken } from '@/lib/auth/jwt'
import { COOKIE_NAME } from '@/lib/auth/cookies'
import { getUserById } from '@/lib/db/queries/users'

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value
  const { pathname } = request.nextUrl
  const isApiRoute = pathname.startsWith('/api/')

  const payload = token ? await verifyToken(token) : null

  if (!payload) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Revocation check: reject tokens issued before validSince
  if (payload.iat != null) {
    const user = getUserById(payload.sub)
    if (!user || new Date(payload.iat * 1000) < new Date(user.validSince)) {
      if (isApiRoute) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      const response = NextResponse.redirect(loginUrl)
      response.cookies.delete(COOKIE_NAME)
      return response
    }
  }

  // Sliding window: re-issue cookie with fresh 7-day expiry
  const response = NextResponse.next()
  const newToken = await signToken({
    sub: payload.sub,
    username: payload.username,
    role: payload.role,
  })
  response.cookies.set(COOKIE_NAME, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  return response
}

export const config = {
  // Protect (app) routes and all API routes except auth/register/health/mcp/setup
  matcher: [
    '/(app)/:path*',
    '/api/((?!auth|register|health|mcp|setup).*)',
  ],
}
