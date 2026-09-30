import { sqlite } from '@/lib/db'
import { getUserById, listLiveUsers, updateUser } from '@/lib/db/queries/users'
import { invalidateResetTokens, resolveResetRequests } from '@/lib/db/queries/password-resets'
import { env } from '@/lib/env'

const DAY_MS = 24 * 60 * 60 * 1000

/** When a user deleted at `deletedAt` gets purged for good. */
export function purgeDateFor(deletedAt: string): Date {
  return new Date(new Date(deletedAt).getTime() + env.USER_DELETE_RETENTION_DAYS * DAY_MS)
}

type LifecycleError = { ok: false; error: string; status: 400 | 404 | 409 }

/** Moves a user to the trash: they can no longer log in, but can be restored until purged. */
export function softDeleteUser(id: string, actorId: string): { ok: true } | LifecycleError {
  const user = getUserById(id)
  if (!user) return { ok: false, error: 'User not found', status: 404 }
  if (user.deletedAt) return { ok: false, error: 'El usuario ya está eliminado', status: 409 }
  if (user.id === actorId) return { ok: false, error: 'No puedes eliminar tu propia cuenta', status: 400 }
  if (user.role === 'admin' && !listLiveUsers().some((u) => u.role === 'admin' && u.id !== id)) {
    return { ok: false, error: 'No se puede eliminar al último administrador', status: 400 }
  }

  const now = new Date().toISOString()
  sqlite.transaction(() => {
    // validSince kills every open session / JWT of the user
    updateUser(id, { deletedAt: now, validSince: now })
    invalidateResetTokens(id, now)
    resolveResetRequests(id, now)
  })()
  return { ok: true }
}

export function restoreUser(id: string): { ok: true } | LifecycleError {
  const user = getUserById(id)
  if (!user) return { ok: false, error: 'User not found', status: 404 }
  if (!user.deletedAt) return { ok: false, error: 'El usuario no está eliminado', status: 409 }
  updateUser(id, { deletedAt: null })
  return { ok: true }
}

/** Permanently removes users whose retention period has passed. Returns how many were purged. */
export function purgeDeletedUsers(now: Date = new Date()): number {
  const cutoff = new Date(now.getTime() - env.USER_DELETE_RETENTION_DAYS * DAY_MS).toISOString()
  const expired = sqlite
    .prepare('SELECT id FROM users WHERE deleted_at IS NOT NULL AND deleted_at < ?')
    .all(cutoff) as { id: string }[]

  const purge = sqlite.transaction((ids: string[]) => {
    for (const id of ids) {
      // invitations reference users without ON DELETE CASCADE
      sqlite.prepare('UPDATE invitations SET used_by = NULL WHERE used_by = ?').run(id)
      sqlite.prepare('DELETE FROM invitations WHERE created_by = ?').run(id)
      // Everything else (entries, tasks, rules, breaks, billed, resets) cascades
      sqlite.prepare('DELETE FROM users WHERE id = ?').run(id)
    }
  })
  purge(expired.map((r) => r.id))
  return expired.length
}

/** Runs at startup to catch purges missed while the server was down. */
export function runStartupUserPurge(): void {
  try {
    const purged = purgeDeletedUsers()
    if (purged > 0) console.log(`[user-purge] Startup: purged ${purged} deleted user(s)`)
  } catch (err) {
    console.error('[user-purge] Startup run failed:', err)
  }
}

/** Registers a daily cron that purges users past the retention period. */
export function scheduleUserPurge(): void {
  const cron = env.USER_PURGE_CRON
  if (!cron) return

  import('node-cron')
    .then((nodeCron) => {
      nodeCron.schedule(cron, () => {
        try {
          const purged = purgeDeletedUsers()
          if (purged > 0) console.log(`[user-purge] Purged ${purged} deleted user(s)`)
        } catch (err) {
          console.error('[user-purge] Cron failed:', err)
        }
      })
      console.log(`[user-purge] Scheduled with cron: ${cron}`)
    })
    .catch((err) => console.error('[user-purge] Failed to load node-cron:', err))
}
