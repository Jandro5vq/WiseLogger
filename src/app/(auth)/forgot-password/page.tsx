'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error || 'No se pudo enviar la solicitud')
      return
    }
    setMessage(data.message)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary">WiseLogger</h1>
          <p className="text-muted-foreground mt-1">Recuperar contraseña</p>
        </div>

        {message ? (
          <p role="status" className="rounded-md border border-border bg-card px-3 py-2 text-sm">
            {message}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="identifier" className="block text-sm font-medium mb-1">
                Usuario o email
              </label>
              <input
                id="identifier"
                type="text"
                required
                autoComplete="username"
                aria-describedby="identifier-hint"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p id="identifier-hint" className="mt-1 text-xs text-muted-foreground">
                Un administrador recibirá tu solicitud y te pasará un enlace para elegir una contraseña nueva.
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Enviando…' : 'Solicitar enlace'}
            </button>
          </form>
        )}

        <p className="text-center text-sm">
          <Link href="/login" className="text-muted-foreground underline hover:text-foreground">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
