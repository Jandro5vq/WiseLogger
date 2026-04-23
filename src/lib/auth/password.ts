import bcrypt from 'bcryptjs'

export const NEEDS_RESET_SENTINEL = 'NEEDS_RESET'

// Pre-computed hash used for timing-safe comparison when user doesn't exist
export const DUMMY_HASH = '$2a$12$x0x0x0x0x0x0x0x0x0x0x.x0x0x0x0x0x0x0x0x0x0x0x0x0x0x0'

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (hash === NEEDS_RESET_SENTINEL) return false
  return bcrypt.compare(plain, hash)
}

/** Returns an error message if password is too weak, or null if OK. */
export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres'
  if (!/[a-z]/.test(password)) return 'La contraseña debe incluir al menos una letra minúscula'
  if (!/[A-Z]/.test(password)) return 'La contraseña debe incluir al menos una letra mayúscula'
  if (!/[0-9]/.test(password)) return 'La contraseña debe incluir al menos un número'
  return null
}
