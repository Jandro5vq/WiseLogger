import { env } from '@/lib/env'

const RESEND_URL = 'https://api.resend.com/emails'
const TIMEOUT_MS = 10_000

export type EmailMessage = {
  /** Short label for logs, e.g. 'invitation'. Logs never carry the recipient or the content. */
  kind: string
  to: string
  subject: string
  html: string
  text: string
}

export function isEmailEnabled(): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM)
}

/**
 * Sends one email through Resend. Never throws: a failed delivery must not undo the
 * operation that triggered it (the link is still there for the admin to copy).
 */
export async function sendEmail(msg: EmailMessage): Promise<{ ok: boolean }> {
  if (!isEmailEnabled()) return { ok: false }
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      console.error(`[email] ${msg.kind}: Resend answered HTTP ${res.status}`)
      return { ok: false }
    }
    return { ok: true }
  } catch (err) {
    console.error(`[email] ${msg.kind}: delivery failed (${err instanceof Error ? err.name : 'unknown error'})`)
    return { ok: false }
  }
}
