import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken, signToken } from '@/lib/auth/jwt'
import { COOKIE_NAME } from '@/lib/auth/cookies'

// ── Rate limiting (in-memory, per-process) ──────────────────────────────────

interface RateBucket { count: number; resetAt: number }
const rateBuckets = new Map<string, RateBucket>()

const AUTH_PATHS = new Set(['/api/auth/login', '/api/register', '/api/setup'])
const AUTH_LIMIT = 10   // per minute
const API_LIMIT = 100   // per minute

// Prune stale entries every 60s
setInterval(() => {
  const now = Date.now()
  rateBuckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) rateBuckets.delete(key)
  })
}, 60_000)

function checkRateLimit(ip: string, pathname: string): NextResponse | null {
  const isAuth = AUTH_PATHS.has(pathname)
  const limit = isAuth ? AUTH_LIMIT : API_LIMIT
  const key = isAuth ? `auth:${ip}` : `api:${ip}`
  const now = Date.now()

  let bucket = rateBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + 60_000 }
    rateBuckets.set(key, bucket)
  }

  bucket.count++
  if (bucket.count > limit) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }
  return null
}

// ── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApiRoute = pathname.startsWith('/api/')

  // Rate limiting on API routes
  if (isApiRoute) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const rateLimited = checkRateLimit(ip, pathname)
    if (rateLimited) return rateLimited
  }

  // CSRF: verify Origin on state-changing requests (exempt /api/mcp — uses API key auth)
  if (isApiRoute && !pathname.startsWith('/api/mcp') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) {
    const origin = request.headers.get('origin')
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const token = request.cookies.get(COOKIE_NAME)?.value
  const payload = token ? await verifyToken(token) : null

  if (!payload) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
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
