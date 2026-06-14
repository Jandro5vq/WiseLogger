'use client'

import { useEffect } from 'react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app] Unhandled error:', error)
  }, [error])

  return (
    <div className="max-w-md mx-auto mt-16 text-center space-y-4">
      <h1 className="text-xl font-bold">Algo ha ido mal</h1>
      <p className="text-sm text-muted-foreground">
        Se produjo un error inesperado al cargar esta sección. Puedes reintentar.
      </p>
      <button
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Reintentar
      </button>
    </div>
  )
}
