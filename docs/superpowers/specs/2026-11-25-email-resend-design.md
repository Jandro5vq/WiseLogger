# Email delivery via Resend — design

Date: 2026-11-25 · Branch: `feat/email` · Release impact: MINOR (new feature)

## Goal

WiseLogger has no email today. An admin copies invitation URLs and password-reset links
by hand, and "Olvidé mi contraseña" only queues a request that an admin has to resolve.
This change sends those emails automatically through Resend, styled like the app, and
makes password recovery self-service.

Success criteria:

- An invitation created with an email address arrives in that inbox with a working
  registration link.
- A user who clicks "Olvidé mi contraseña" gets a reset link by email with no admin step.
- A user is told by email whenever their password changes.
- An admin can send a test email to check the configuration.
- With email not configured, every flow behaves exactly as it does today.

Out of scope (possible later): welcome email after signup, admin alerts on reset
requests, per-user accent colour in emails, email verification on signup.

## Configuration

New lazy getters in `src/lib/env.ts`:

| Variable          | Example                                 | Notes                       |
|-------------------|-----------------------------------------|-----------------------------|
| `RESEND_API_KEY`  | `re_…`                                  | optional; never logged      |
| `EMAIL_FROM`      | `WiseLogger <no-reply@tudominio.com>`   | must be on a verified domain |

`isEmailEnabled` (exported from `src/lib/email/send.ts`) is true only when both are set.
Both are added (empty) to `.env.example` with a comment. Links in emails are built from
`BASE_URL`, which must be the public URL in production.

Ops (runbook note, not code): verify the sending domain in Resend (SPF and DKIM DNS
records) and set both variables in the prod `.env`.

## Module `src/lib/email/`

- **`send.ts`**
  - `sendEmail({ to, subject, html, text }): Promise<{ ok: boolean }>` POSTs to
    `https://api.resend.com/emails` with `fetch` (no new dependency), using
    `Authorization: Bearer <key>` and a 10 s `AbortSignal.timeout`.
  - It never throws. When email is disabled, on a non-2xx response or on a network error,
    it returns `{ ok: false }` and logs one line with the email kind and the HTTP status
    or error name. The log never includes the recipient, the token, the URL or the API key.
- **`layout.ts`**
  - `renderLayout({ preheader, title, bodyHtml }): string` returns the shared HTML shell
    (see "Look").
  - `escapeHtml(s)`: every interpolated value (username, URL, dates) goes through it.
- **`templates.ts`** has one function per email, each returning `{ subject, html, text }`:
  - `invitationEmail({ url, expiresAt })`
  - `passwordResetEmail({ username, url, expiresAt })`
  - `passwordChangedEmail({ username, changedAt })`
  - `testEmail({ username })`

  The text is in Spanish and dates are formatted with `es-ES` in the recipient's `users.timezone`. Invitations have no recipient account yet, so they use the inviting admin's timezone. Each template takes a `timezone` argument. Each
  email has a plain-text alternative.

## Look

The emails mirror the `/login` screen and use only inline styles and table layout, so
Gmail and Outlook render them correctly.

- **Page:** `#f1f5f9` background with a centred white card (max width 480px, 8px radius,
  `1px solid #e2e8f0` border, 32px padding).
- **Header:**
  - `BASE_URL/icons/icon-192.png` at 48px (PNG; SVG is blocked by Gmail and Outlook).
  - "WiseLogger" in bold `#2563eb` at 28px.
  - "Registro de jornada" in `#64748b`.
- **Body:**
  - A heading, then paragraphs in `#0f172a` at 15px with a line height of 1.6.
  - A primary button: a solid `#2563eb` block with white text, 6px radius and 12px × 24px
    padding, built as a table cell so Outlook keeps it.
  - Below the button, a fallback line: "¿El botón no funciona? Copia este enlace:", then
    the URL and expiry in 13px `#64748b`.
- **Callout (password changed):** amber, `#fffbeb` background with a `#f59e0b` left border.
- **Footer:** 12px `#64748b` text saying why the email was sent, plus a link to `BASE_URL`.
- **Fonts:** `Inter, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif`. No
  webfonts.
- **Dark mode:** a `<style>` block with `@media (prefers-color-scheme: dark)` plus
  `color-scheme` meta tags. The classes there switch to the app's Nordic palette:
  - background `#141b26`
  - card `#191f2e`
  - border `#222d3e`
  - text `#ccd6e8`
  - muted `#7a8fa6`
  - primary `#4d96d9`

  Clients that ignore it (Gmail) show the light version.
- **Hidden preheader:** a short preview text for the inbox list.

During implementation all four emails are rendered, light and dark, into a preview page
for the user to review. Nothing extra is committed for that.

## Flows

### Invitation (`POST /api/admin/invitations`)

- Unchanged: creating the invitation and returning `registrationUrl`.
- New: if `email` was given and email is enabled, the handler awaits sending
  `invitationEmail`. The response adds `emailSent: boolean`.
- UI (`src/app/(app)/admin/invitations/page.tsx`):
  - Shows "Invitación enviada a <email>" when `emailSent` is true.
  - The copy-link button stays either way, as a fallback.
  - When email is disabled, the UI is as today.

### Forgot password (`POST /api/auth/forgot-password`)

`requestPasswordReset(identifier)` keeps its signature and its silent no-op for unknown,
suspended and deleted accounts.

- **Email disabled:** today's behaviour. It records a `password_reset_requests` row for an
  admin.
- **Email enabled:**
  1. **Throttle.** If the user's newest reset token is self-service (`createdBy IS NULL`)
     and was created less than 5 minutes ago, do nothing. This needs a new query,
     `getLatestResetToken(userId)`.
  2. Otherwise call `issueResetLink(userId, null)`. `adminId` becomes `string | null`;
     `null` means self-service. As today, this supersedes older tokens and resolves open
     requests.
  3. Send `passwordResetEmail` **without awaiting** it (`void sendEmail(...)`). The
     response time is then the same whether or not the account exists, so it can't be
     used to tell which accounts exist.
- **Response.** The message is identical for every identifier and depends only on the mode:
  - Email on: "Si la cuenta existe, recibirás un email con un enlace para restablecer la
    contraseña."
  - Email off: the current admin message.

### Admin-issued reset link (`POST /api/admin/users/[id]/reset-link`)

- Unchanged: returns `{ url, expiresAt }`.
- New: when email is enabled, it awaits sending `passwordResetEmail` to the user's address
  and adds `emailSent: boolean`.
- `src/app/(app)/admin/users/page.tsx` shows "Enlace enviado por email" when it's true.

### Reset with token (`resetPasswordWithToken`)

- On success, it sends `passwordChangedEmail` without awaiting.
- The `INVALID_LINK` text becomes mode-aware:
  - Email on: "El enlace no es válido o ha caducado. Solicita uno nuevo."
  - Email off: the current text.

### Change password (`POST /api/auth/change-password`)

On success, it sends `passwordChangedEmail` without awaiting.

### Test email (`POST /api/admin/email/test`)

- Uses the `requireAdmin()` try/catch pattern (→ 403).
- With email disabled, returns `400 { error: 'El correo no está configurado' }`.
- Otherwise awaits `testEmail` to the admin's own address and returns `{ ok }`, with a 502
  and an error message if Resend failed.
- On the admin dashboard, a "Correo" card shows the status ("Configurado (remitente: …)" or
  "No configurado: define RESEND_API_KEY y EMAIL_FROM") and an "Enviar email de prueba"
  button.

## Data

No migration. Self-service tokens use the existing `password_reset_tokens.created_by` set
to NULL (the column is already nullable).

## Error handling

- A failed send never fails the user-facing operation. The invitation, the token and the
  password change are all committed first.
- An admin learns about failures through `emailSent: false`, and the copyable link remains.
- A user who doesn't receive the reset email can retry after 5 minutes, or ask an admin.

## Tests

- `src/lib/email/send.test.ts` (with `fetch` mocked):
  - Correct request URL, headers and body.
  - `{ ok: false }` on a non-2xx response, on a thrown error and when disabled (no fetch
    call).
  - The log line never contains the recipient or the token.
- `src/lib/email/templates.test.ts`:
  - Each template includes its URL and the escaped username.
  - `<script>` in a username comes out escaped.
  - The text version contains the URL.
- Password-reset integration tests (temp SQLite, `sendEmail` mocked):
  - Email on: a token is created with `createdBy` NULL and one email is sent.
  - A second request within 5 minutes sends nothing; after 5 minutes it does.
  - Unknown and suspended accounts: no email, same response.
  - Email off: a request row is created and no email is sent.
  - A successful reset sends the password-changed email.
- Route tests:
  - Invitation with an email → `emailSent: true`; without one → no send.
  - Reset-link → `emailSent`.
  - Test-email route: 403 for non-admins, 400 when disabled.
  - Change-password sends the notice.

Run with `npx tsc --noEmit && npm run lint && npx vitest run` under Node 20.
