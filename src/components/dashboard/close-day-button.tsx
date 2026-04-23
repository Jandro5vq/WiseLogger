'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export function CloseDayButton({ disabled }: { disabled: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const handleCloseDay = useCallback(() => setConfirming(true), [])
  useEffect(() => {
    window.addEventListener('wl:close-day', handleCloseDay)
    return () => window.removeEventListener('wl:close-day', handleCloseDay)
  }, [handleCloseDay])

  async function closeDay() {
    setLoading(true)
    await fetch('/api/entries/today/close', { method: 'POST' })
    setLoading(false)
    setConfirming(false)
    router.refresh()
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
        <span className="text-sm flex-1">¿Cerrar la jornada de hoy?</span>
        <button
          onClick={closeDay}
          disabled={loading}
          className="rounded bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
        >
          {loading ? 'Cerrando…' : 'Confirmar'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded border border-border px-3 py-1 text-xs hover:bg-accent"
        >
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      disabled={disabled}
      className="w-full rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      Cerrar jornada <span className="text-xs opacity-60">(C)</span>
    </button>
  )
}
