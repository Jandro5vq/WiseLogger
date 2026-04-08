import bcrypt from 'bcryptjs'

export const NEEDS_RESET_SENTINEL = 'NEEDS_RESET'

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (hash === NEEDS_RESET_SENTINEL) return false
  return bcrypt.compare(plain, hash)
}
