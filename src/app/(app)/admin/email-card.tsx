'use client'

import { useState } from 'react'

export function EmailCard({ enabled, from }: { enabled: boolean; from: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function sendTest() {
    setState('sending')
    const res = await fetch('/api/admin/email/test', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setState('ok')
      setMessage(`Enviado a ${data.to}. Revisa tu bandeja de entrada.`)
    } else {
      setState('error')
      setMessage(data.error ?? 'No se pudo enviar el email')
    }
  }

  return (
    <div className="col-span-2 rounded-lg border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-2xl mb-2">📮</div>
          <h2 className="font-semibold">Correo</h2>
          {enabled ? (
            <p className="text-sm text-muted-foreground mt-1">
              Configurado. Las invitaciones y los enlaces de contraseña se envían por email desde{' '}
              <span className="text-foreground">{from}</span>.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              No configurado: define <code>RESEND_API_KEY</code> y <code>EMAIL_FROM</code>. Mientras tanto, los enlaces se
              copian y se pasan a mano.
            </p>
          )}
        </div>
        {enabled && (
          <button
            onClick={sendTest}
            disabled={state === 'sending'}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {state === 'sending' ? 'Enviando…' : 'Enviar email de prueba'}
          </button>
        )}
      </div>
      {message && (
        <p
          role="status"
          className={`mt-3 text-sm ${state === 'error' ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}
        >
          {message}
        </p>
      )}
    </div>
  )
}
