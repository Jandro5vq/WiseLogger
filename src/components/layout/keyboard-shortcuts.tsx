'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export interface Shortcut {
  keys: string[]
  label: string
}

export const SHORTCUTS: Shortcut[] = [
  { keys: ['N'], label: 'Nueva tarea' },
  { keys: ['S'], label: 'Detener la tarea activa' },
  { keys: ['C'], label: 'Cerrar la jornada' },
  { keys: ['/'], label: 'Buscar' },
]

export function KeyboardShortcuts() {
  const router = useRouter()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key) {
        case 'n':
        case 'N':
          // Dispatch custom event to open new task modal
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
        case '/':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('wl:search'))
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [router])

  return null
}
