import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { sqlite } from '@/lib/db'
import { getUserByEmail, getUserById, getUserByUsername, updateUser } from '@/lib/db/queries/users'
import {
  createResetRequest,
  createResetToken,
  getLatestResetToken,
  getOpenResetRequest,
  getResetTokenByHash,
  invalidateResetTokens,
  resolveResetRequests,
} from '@/lib/db/queries/password-resets'
import { hashPassword, validatePassword } from '@/lib/auth/password'
import { env } from '@/lib/env'
import { isEmailEnabled } from '@/lib/email/send'
import { sendPasswordChangedEmail, sendPasswordResetEmail } from '@/lib/email/notifications'

// With email configured, a reset requested from the login screen is self-service: the
// link is emailed straight away. Without it, the request waits for an admin to issue a
// single-use, expiring link and pass it on by hand.

/** Self-service resets for one account are emailed at most once per this window. */
export const SELF_SERVICE_RESET_COOLDOWN_MS = 5 * 60 * 1000

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

/**
 * Records a reset request for the account matching a username or email.
 * Silently does nothing for unknown, suspended or deleted accounts so the
 * caller can always answer the same thing (no account enumeration).
 */
export function requestPasswordReset(identifier: string): void {
  const id = identifier.trim()
  if (!id) return
  const user = id.includes('@') ? getUserByEmail(id) : getUserByUsername(id)
  if (!user || !user.isActive || user.deletedAt) return

  if (isEmailEnabled()) {
    // Throttle so the public form can't be used to flood someone's inbox
    const latest = getLatestResetToken(user.id)
    if (
      latest &&
      latest.createdBy === null &&
      Date.now() - new Date(latest.createdAt).getTime() < SELF_SERVICE_RESET_COOLDOWN_MS
    ) {
      return
    }
    const link = issueResetLink(user.id, null)
    // Not awaited: the answer must take the same time whether or not the account exists
    void sendPasswordResetEmail(user, link)
    return
  }

  if (getOpenResetRequest(user.id)) return
  createResetRequest({ id: uuidv4(), userId: user.id, requestedAt: new Date().toISOString() })
}

/**
 * Issues a fresh link for the user, superseding older ones and resolving open requests.
 * `adminId` is null for a self-service request.
 */
export function issueResetLink(userId: string, adminId: string | null): { url: string; expiresAt: string } {
  const raw = crypto.randomBytes(32).toString('hex')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + env.PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000).toISOString()

  sqlite.transaction(() => {
    invalidateResetTokens(userId, now.toISOString())
    resolveResetRequests(userId, now.toISOString())
    createResetToken({
      id: uuidv4(),
      userId,
      tokenHash: hashToken(raw),
      createdBy: adminId,
      createdAt: now.toISOString(),
      expiresAt,
    })
  })()

  const base = env.BASE_URL.replace(/\/+$/, '')
  return { url: `${base}/reset-password?token=${raw}`, expiresAt }
}

export type ResetResult = { ok: true } | { ok: false; error: string; status: 400 }

function invalidLink(): string {
  return isEmailEnabled()
    ? 'El enlace no es válido o ha caducado. Solicita uno nuevo.'
    : 'El enlace no es válido o ha caducado. Pide uno nuevo al administrador.'
}

/** Sets a new password using a reset token. The token is single-use. */
export async function resetPasswordWithToken(rawToken: string, password: string): Promise<ResetResult> {
  const token = rawToken ? getResetTokenByHash(hashToken(rawToken)) : undefined
  if (!token || token.usedAt || new Date(token.expiresAt) <= new Date()) {
    return { ok: false, error: invalidLink(), status: 400 }
  }
  const user = getUserById(token.userId)
  if (!user || !user.isActive || user.deletedAt) {
    return { ok: false, error: invalidLink(), status: 400 }
  }

  const pwError = validatePassword(password)
  if (pwError) return { ok: false, error: pwError, status: 400 }

  const passwordHash = await hashPassword(password)
  const now = new Date().toISOString()
  const consumed = sqlite.transaction(() => {
    // Re-check inside the transaction: two concurrent submits must not both succeed
    const fresh = getResetTokenByHash(token.tokenHash)
    if (!fresh || fresh.usedAt) return false
    // validSince closes every open session, as with a password change
    updateUser(user.id, { passwordHash, validSince: now })
    invalidateResetTokens(user.id, now)
    resolveResetRequests(user.id, now)
    return true
  })()
  if (!consumed) return { ok: false, error: invalidLink(), status: 400 }
  void sendPasswordChangedEmail(user, now)
  return { ok: true }
}
