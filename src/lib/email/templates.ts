import { button, callout, escapeHtml, fallbackLink, heading, paragraph, renderLayout } from './layout'

export type RenderedEmail = { subject: string; html: string; text: string }

function formatDate(iso: string, timezone: string): string {
  const opts: Intl.DateTimeFormatOptions = { dateStyle: 'long', timeStyle: 'short' }
  try {
    return new Intl.DateTimeFormat('es-ES', { ...opts, timeZone: timezone }).format(new Date(iso))
  } catch {
    // Unknown IANA zone stored on an old account: fall back to UTC instead of failing the send
    return new Intl.DateTimeFormat('es-ES', { ...opts, timeZone: 'UTC' }).format(new Date(iso)) + ' (UTC)'
  }
}

function lines(...parts: string[]): string {
  return parts.join('\n')
}

export function invitationEmail(o: { url: string; expiresAt: string; timezone: string }): RenderedEmail {
  const expires = formatDate(o.expiresAt, o.timezone)
  const subject = 'Te han invitado a WiseLogger'
  const html = renderLayout({
    title: subject,
    preheader: 'Crea tu cuenta para empezar a registrar tu jornada.',
    footer: 'Recibes este email porque un administrador te ha invitado a WiseLogger. Si no lo esperabas, puedes ignorarlo.',
    bodyHtml: lines(
      heading('¡Te damos la bienvenida!'),
      paragraph('Un administrador te ha invitado a <strong>WiseLogger</strong>, la herramienta para registrar tu jornada y tus tareas.'),
      paragraph('Pulsa el botón para elegir tu usuario y contraseña:'),
      button('Crear mi cuenta', o.url),
      fallbackLink(o.url, `La invitación caduca el ${escapeHtml(expires)} y solo puede usarse una vez.`),
    ),
  })
  const text = lines(
    '¡Te damos la bienvenida!',
    '',
    'Un administrador te ha invitado a WiseLogger. Crea tu cuenta en este enlace:',
    o.url,
    '',
    `La invitación caduca el ${expires} y solo puede usarse una vez.`,
    'Si no esperabas esta invitación, puedes ignorar este email.',
  )
  return { subject, html, text }
}

export function passwordResetEmail(o: { username: string; url: string; expiresAt: string; timezone: string }): RenderedEmail {
  const expires = formatDate(o.expiresAt, o.timezone)
  const subject = 'Restablece tu contraseña de WiseLogger'
  const html = renderLayout({
    title: subject,
    preheader: 'Usa este enlace para elegir una contraseña nueva.',
    footer: 'Recibes este email porque se ha pedido restablecer la contraseña de tu cuenta de WiseLogger.',
    bodyHtml: lines(
      heading(`Hola, ${o.username}`),
      paragraph('Hemos recibido una petición para restablecer la contraseña de tu cuenta.'),
      paragraph('Pulsa el botón para elegir una contraseña nueva:'),
      button('Restablecer contraseña', o.url),
      fallbackLink(o.url, `El enlace caduca el ${escapeHtml(expires)} y solo puede usarse una vez.`),
      `<p class="wl-muted" style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#64748b;">Si no lo has pedido tú, ignora este email: tu contraseña no cambiará.</p>`,
    ),
  })
  const text = lines(
    `Hola, ${o.username}`,
    '',
    'Hemos recibido una petición para restablecer la contraseña de tu cuenta de WiseLogger.',
    'Elige una contraseña nueva en este enlace:',
    o.url,
    '',
    `El enlace caduca el ${expires} y solo puede usarse una vez.`,
    'Si no lo has pedido tú, ignora este email: tu contraseña no cambiará.',
  )
  return { subject, html, text }
}

export function passwordChangedEmail(o: { username: string; changedAt: string; timezone: string }): RenderedEmail {
  const when = formatDate(o.changedAt, o.timezone)
  const subject = 'Tu contraseña de WiseLogger ha cambiado'
  const html = renderLayout({
    title: subject,
    preheader: 'Aviso de seguridad sobre tu cuenta.',
    footer: 'Este es un aviso de seguridad automático de WiseLogger.',
    bodyHtml: lines(
      heading(`Hola, ${o.username}`),
      paragraph(`La contraseña de tu cuenta se cambió el <strong>${escapeHtml(when)}</strong>. Por seguridad, se han cerrado todas tus sesiones abiertas.`),
      callout('<strong>¿No has sido tú?</strong> Ponte en contacto con el administrador de WiseLogger cuanto antes.'),
      paragraph('Si has sido tú, no tienes que hacer nada más.'),
    ),
  })
  const text = lines(
    `Hola, ${o.username}`,
    '',
    `La contraseña de tu cuenta de WiseLogger se cambió el ${when}. Se han cerrado todas tus sesiones abiertas.`,
    '',
    '¿No has sido tú? Ponte en contacto con el administrador de WiseLogger cuanto antes.',
    'Si has sido tú, no tienes que hacer nada más.',
  )
  return { subject, html, text }
}

export function testEmail(o: { username: string }): RenderedEmail {
  const subject = 'Email de prueba de WiseLogger'
  const html = renderLayout({
    title: subject,
    preheader: 'El envío de emails funciona correctamente.',
    footer: 'Has enviado este email de prueba desde el panel de administración.',
    bodyHtml: lines(
      heading(`Hola, ${o.username}`),
      paragraph('Si estás leyendo esto, el envío de emails de WiseLogger está <strong>bien configurado</strong>.'),
      paragraph('Las invitaciones y los enlaces para restablecer la contraseña se enviarán automáticamente por email.'),
    ),
  })
  const text = lines(
    `Hola, ${o.username}`,
    '',
    'Si estás leyendo esto, el envío de emails de WiseLogger está bien configurado.',
  )
  return { subject, html, text }
}
