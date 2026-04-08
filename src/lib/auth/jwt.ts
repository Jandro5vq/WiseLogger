import { SignJWT, jwtVerify } from 'jose'
import { env } from '@/lib/env'

export interface JwtPayload {
  sub: string // user id
  username: string
  role: 'admin' | 'user'
}

function getSecret(): Uint8Array {
  return new TextEncoder().encode(env.SECRET_KEY)
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ username: payload.username, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret())
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return {
      sub: payload.sub as string,
      username: payload.username as string,
      role: payload.role as 'admin' | 'user',
    }
  } catch {
    return null
  }
}
