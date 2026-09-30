import { db } from '@/lib/db'
import { passwordResetRequests, passwordResetTokens, users } from '@db/schema'
import { and, eq, isNull } from 'drizzle-orm'

export function getOpenResetRequest(userId: string) {
  return db
    .select()
    .from(passwordResetRequests)
    .where(and(eq(passwordResetRequests.userId, userId), isNull(passwordResetRequests.resolvedAt)))
    .get()
}

export function createResetRequest(data: { id: string; userId: string; requestedAt: string }) {
  return db.insert(passwordResetRequests).values(data).returning().get()
}

/** Open requests for users that are not in the trash, oldest first. */
export function listOpenResetRequests() {
  return db
    .select({
      id: passwordResetRequests.id,
      userId: passwordResetRequests.userId,
      requestedAt: passwordResetRequests.requestedAt,
    })
    .from(passwordResetRequests)
    .innerJoin(users, eq(users.id, passwordResetRequests.userId))
    .where(and(isNull(passwordResetRequests.resolvedAt), isNull(users.deletedAt)))
    .orderBy(passwordResetRequests.requestedAt)
    .all()
}

export function resolveResetRequests(userId: string, at: string) {
  db.update(passwordResetRequests)
    .set({ resolvedAt: at })
    .where(and(eq(passwordResetRequests.userId, userId), isNull(passwordResetRequests.resolvedAt)))
    .run()
}

export function createResetToken(data: {
  id: string
  userId: string
  tokenHash: string
  createdBy: string
  createdAt: string
  expiresAt: string
}) {
  return db.insert(passwordResetTokens).values(data).returning().get()
}

export function getResetTokenByHash(tokenHash: string) {
  return db.select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash)).get()
}

/** Marks every still-usable token of the user as used (superseded, consumed or revoked). */
export function invalidateResetTokens(userId: string, at: string) {
  db.update(passwordResetTokens)
    .set({ usedAt: at })
    .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)))
    .run()
}
