import { env } from '@/lib/env'

// Inline styles + tables only: Gmail strips <head> styles it doesn't like and Outlook
// ignores most modern CSS. The <style> block just adds dark mode for clients that
// support it (Apple Mail, iOS); everyone else gets the light version.
// Colours mirror the app's tokens in globals.css (light theme + "Nordic" dark theme).

export const colors = {
  page: '#f1f5f9',
  card: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  muted: '#64748b',
  primary: '#2563eb',
  primaryText: '#ffffff',
  calloutBg: '#fffbeb',
  calloutBorder: '#f59e0b',
} as const

const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function baseUrl(): string {
  return env.BASE_URL.replace(/\/+$/, '')
}

export function paragraph(html: string): string {
  return `<p class="wl-text" style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${colors.text};">${html}</p>`
}

export function heading(text: string): string {
  return `<h2 class="wl-text" style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:700;color:${colors.text};">${escapeHtml(text)}</h2>`
}

/** Bulletproof button: a table cell so Outlook keeps the background and padding. */
export function button(label: string, url: string): string {
  const href = escapeHtml(url)
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr><td class="wl-btn" bgcolor="${colors.primary}" style="border-radius:6px;background:${colors.primary};">
    <a class="wl-btn-link" href="${href}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:600;color:${colors.primaryText};text-decoration:none;border-radius:6px;">${escapeHtml(label)}</a>
  </td></tr>
</table>`
}

/** The plain link under the button, for clients that don't render it. */
export function fallbackLink(url: string, note?: string): string {
  const href = escapeHtml(url)
  return `<p class="wl-muted" style="margin:0 0 8px;font-size:13px;line-height:1.5;color:${colors.muted};">¿El botón no funciona? Copia este enlace en tu navegador:</p>
<p style="margin:0 0 16px;font-size:13px;line-height:1.5;word-break:break-all;"><a class="wl-link" href="${href}" style="color:${colors.primary};">${href}</a></p>${
    note ? `\n<p class="wl-muted" style="margin:0;font-size:13px;line-height:1.5;color:${colors.muted};">${note}</p>` : ''
  }`
}

export function callout(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
  <tr><td class="wl-callout" style="background:${colors.calloutBg};border-left:4px solid ${colors.calloutBorder};border-radius:4px;padding:12px 16px;font-size:14px;line-height:1.5;color:${colors.text};">${html}</td></tr>
</table>`
}

export function renderLayout(opts: { title: string; preheader: string; bodyHtml: string; footer: string }): string {
  const base = baseUrl()
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(opts.title)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .wl-page { background:#141b26 !important; }
    .wl-card { background:#191f2e !important; border-color:#222d3e !important; }
    .wl-text { color:#ccd6e8 !important; }
    .wl-muted { color:#7a8fa6 !important; }
    .wl-brand, .wl-link { color:#4d96d9 !important; }
    .wl-btn { background:#4d96d9 !important; }
    .wl-btn-link { color:#141b26 !important; }
    .wl-callout { background:#2a2618 !important; color:#ccd6e8 !important; }
  }
  @media (max-width: 520px) { .wl-card-pad { padding:24px !important; } }
</style>
</head>
<body class="wl-page" style="margin:0;padding:0;background:${colors.page};font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(opts.preheader)}</div>
<table role="presentation" class="wl-page" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${colors.page};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
      <tr><td align="center" style="padding:0 0 24px;">
        <img src="${escapeHtml(base)}/icons/icon-192.png" width="48" height="48" alt="" style="display:block;border:0;width:48px;height:48px;margin:0 auto 12px;">
        <div class="wl-brand" style="font-family:${FONT};font-size:28px;font-weight:700;line-height:1.2;color:${colors.primary};">WiseLogger</div>
        <div class="wl-muted" style="font-family:${FONT};font-size:14px;line-height:1.5;color:${colors.muted};margin-top:4px;">Registro de jornada</div>
      </td></tr>
      <tr><td class="wl-card wl-card-pad" style="background:${colors.card};border:1px solid ${colors.border};border-radius:8px;padding:32px;font-family:${FONT};">
${opts.bodyHtml}
      </td></tr>
      <tr><td align="center" style="padding:24px 8px 0;">
        <p class="wl-muted" style="margin:0 0 4px;font-family:${FONT};font-size:12px;line-height:1.5;color:${colors.muted};">${opts.footer}</p>
        <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.5;"><a class="wl-link" href="${escapeHtml(base)}" style="color:${colors.muted};">${escapeHtml(base.replace(/^https?:\/\//, ''))}</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`
}
