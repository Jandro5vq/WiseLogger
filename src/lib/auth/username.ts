import { z } from 'zod'

// Usernames: 3–30 chars, start with a letter, then letters (accents/ñ included),
// digits, dot, underscore or hyphen. No spaces — a stray space at registration
// used to produce accounts nobody could log into.
// Built with RegExp(): the tsconfig target predates regex-literal `u` flags
const STARTS_WITH_LETTER = new RegExp('^\\p{L}', 'u')
const USERNAME_RE = new RegExp('^\\p{L}[\\p{L}\\p{N}._-]{2,29}$', 'u')

/** Trims, NFC-normalizes and upper-cases the first letter; the rest is kept as typed. */
export function normalizeUsername(raw: string): string {
  const s = raw.trim().normalize('NFC')
  if (!s) return s
  const [first, ...rest] = Array.from(s)
  return first.toLocaleUpperCase('es') + rest.join('')
}

/** Returns an error message if the (normalized) username is invalid, or null if OK. */
export function validateUsername(username: string): string | null {
  if (!username) return 'El usuario es obligatorio'
  if (/\s/.test(username)) return 'El usuario no puede contener espacios'
  const len = Array.from(username).length
  if (len < 3) return 'El usuario debe tener al menos 3 caracteres'
  if (len > 30) return 'El usuario no puede tener más de 30 caracteres'
  if (!STARTS_WITH_LETTER.test(username)) return 'El usuario debe empezar por una letra'
  if (!USERNAME_RE.test(username)) return 'El usuario solo puede contener letras, números, punto, guion y guion bajo'
  return null
}

/** Case-insensitive comparison key (Unicode-aware, unlike SQLite's ASCII-only LOWER()). */
export function usernameKey(username: string): string {
  return username.trim().normalize('NFC').toLocaleLowerCase('es')
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Returns an error message if the (normalized) email is invalid, or null if OK. */
export function validateEmail(email: string): string | null {
  if (!email) return 'El email es obligatorio'
  if (!z.email().safeParse(email).success) return 'El email no es válido'
  return null
}
