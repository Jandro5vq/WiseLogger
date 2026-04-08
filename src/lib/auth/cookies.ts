import { NextResponse } from 'next/server'
import { env } from '@/lib/env'

export const COOKIE_NAME = 'auth_token'
const MAX_AGE = 60 * 60 * 24 * 7 // 7 days in seconds
const IS_PROD = env.NODE_ENV === 'production'

export function setAuthCookie(response: NextResponse, token: string): void {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'strict',
    maxAge: MAX_AGE,
    path: '/',
  })
}

export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  })
}
