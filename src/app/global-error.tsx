'use client'

import { useEffect } from 'react'

// Global error boundary: replaces the root layout, so it must render <html>/<body>
// and can't rely on Tailwind (globals.css is loaded by the root layout). Inline styles.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[global] Unhandled error:', error)
  }, [error])

  return (
    <html lang="es">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        <div
          style={{
            maxWidth: 420,
            margin: '4rem auto',
            textAlign: 'center',
            padding: '0 1rem',
          }}
        >
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Algo ha ido mal</h1>
          <p style={{ fontSize: '0.875rem', color: '#666' }}>
            Se produjo un error inesperado. Recarga la página o reinténtalo.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: '0.5rem',
              borderRadius: 6,
              border: 'none',
              background: '#111',
              color: '#fff',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  )
}
