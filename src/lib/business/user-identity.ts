import { getUserByEmail, getUserByUsername } from '@/lib/db/queries/users'
import { normalizeEmail, normalizeUsername, validateEmail, validateUsername } from '@/lib/auth/username'
import { purgeDateFor } from '@/lib/business/user-lifecycle'

type Result<T> = { ok: true; value: T } | { ok: false; error: string; status: 400 | 409 }

function takenMessage(what: 'usuario' | 'email', owner: { deletedAt: string | null }): string {
  if (!owner.deletedAt) {
    return what === 'usuario' ? 'Ese usuario ya está en uso' : 'Ese email ya está registrado'
  }
  const date = purgeDateFor(owner.deletedAt).toLocaleDateString('es-ES')
  return `Ese ${what} pertenece a una cuenta eliminada. Se libera el ${date}, o restaura la cuenta.`
}

/** Normalizes + validates a username and checks it is free (ignoring `selfId`). */
export function checkUsername(raw: unknown, selfId?: string): Result<string> {
  const username = normalizeUsername(typeof raw === 'string' ? raw : '')
  const error = validateUsername(username)
  if (error) return { ok: false, error, status: 400 }
  const owner = getUserByUsername(username)
  if (owner && owner.id !== selfId) return { ok: false, error: takenMessage('usuario', owner), status: 409 }
  return { ok: true, value: username }
}

/** Normalizes + validates an email and checks it is free (ignoring `selfId`). */
export function checkEmail(raw: unknown, selfId?: string): Result<string> {
  const email = normalizeEmail(typeof raw === 'string' ? raw : '')
  const error = validateEmail(email)
  if (error) return { ok: false, error, status: 400 }
  const owner = getUserByEmail(email)
  if (owner && owner.id !== selfId) return { ok: false, error: takenMessage('email', owner), status: 409 }
  return { ok: true, value: email }
}
