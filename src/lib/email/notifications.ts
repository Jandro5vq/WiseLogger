import { sendEmail } from './send'
import { invitationEmail, passwordChangedEmail, passwordResetEmail, testEmail } from './templates'

type Recipient = { email: string; username: string; timezone: string }

export function sendInvitationEmail(to: string, o: { url: string; expiresAt: string; timezone: string }) {
  return sendEmail({ kind: 'invitation', to, ...invitationEmail(o) })
}

export function sendPasswordResetEmail(user: Recipient, o: { url: string; expiresAt: string }) {
  return sendEmail({
    kind: 'password-reset',
    to: user.email,
    ...passwordResetEmail({ username: user.username, timezone: user.timezone, ...o }),
  })
}

export function sendPasswordChangedEmail(user: Recipient, changedAt: string) {
  return sendEmail({
    kind: 'password-changed',
    to: user.email,
    ...passwordChangedEmail({ username: user.username, timezone: user.timezone, changedAt }),
  })
}

export function sendTestEmail(user: Recipient) {
  return sendEmail({ kind: 'test', to: user.email, ...testEmail({ username: user.username }) })
}
