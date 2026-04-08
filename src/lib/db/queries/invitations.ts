import { db } from '@/lib/db'
import { invitations } from '@db/schema'
import { eq } from 'drizzle-orm'

export function getInvitationByToken(token: string) {
  return db.select().from(invitations).where(eq(invitations.token, token)).get()
}

export function listInvitations() {
  return db.select().from(invitations).all()
}

export function createInvitation(data: {
  id: string
  token: string
  email?: string
  createdBy: string
  expiresAt: string
}) {
  return db.insert(invitations).values(data).returning().get()
}

export function markInvitationUsed(token: string, usedBy: string, usedAt: string) {
  return db
    .update(invitations)
    .set({ usedAt, usedBy })
    .where(eq(invitations.token, token))
    .returning()
    .get()
}

export function revokeInvitation(id: string) {
  const now = new Date().toISOString()
  return db
    .update(invitations)
    .set({ usedAt: now })
    .where(eq(invitations.id, id))
    .returning()
    .get()
}
