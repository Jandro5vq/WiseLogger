'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface Shortcut {
  keys: string[]
  label: string
}

export const SHORTCUTS: Shortcut[] = [
  { keys: ['N'], label: 'Nueva tarea' },
  { keys: ['S'], label: 'Detener la tarea activa' },
  { keys: ['C'], label: 'Cerrar la jornada' },
  { keys: ['?'], label: 'Mostrar atajos de teclado' },
]

export function KeyboardShortcuts() {
  const router = useRouter()
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      // '?' (Shift+/) toggles the shortcuts overlay; Escape closes it.
      if (e.key === '?') {
        e.preventDefault()
        setShowHelp((v) => !v)
        return
      }
      if (e.key === 'Escape') {
        setShowHelp(false)
        return
      }

      switch (e.key) {
        case 'n':
        case 'N':
          window.dispatchEvent(new CustomEvent('wl:new-task'))
          break
        case 's':
        case 'S':
          window.dispatchEvent(new CustomEvent('wl:stop-task'))
          break
        case 'c':
        case 'C':
          window.dispatchEvent(new CustomEvent('wl:close-day'))
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [router])

  if (!showHelp) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={() => setShowHelp(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Atajos de teclado"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs rounded-lg border border-border bg-card p-5 shadow-xl"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Atajos de teclado</h2>
          <button
            onClick={() => setShowHelp(false)}
            aria-label="Cerrar"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <ul className="space-y-2">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd key={k} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
