'use client'

import { useEffect } from 'react'

export const ACCENT_STORAGE_KEY = 'wl:accent'

export const ACCENTS = [
  { id: 'blue',   label: 'Azul',    hex: '#3b82f6' },
  { id: 'purple', label: 'Violeta', hex: '#a855f7' },
  { id: 'teal',   label: 'Turquesa', hex: '#14b8a6' },
  { id: 'green',  label: 'Verde',   hex: '#22c55e' },
  { id: 'orange', label: 'Naranja', hex: '#f97316' },
  { id: 'pink',   label: 'Rosa',    hex: '#ec4899' },
] as const

export type AccentId = typeof ACCENTS[number]['id']

export const DEFAULT_ACCENT: AccentId = 'blue'

function applyAccent(id: string) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-accent', id)
}

export function readStoredAccent(): AccentId {
  if (typeof window === 'undefined') return DEFAULT_ACCENT
  const v = localStorage.getItem(ACCENT_STORAGE_KEY)
  if (v && ACCENTS.some((a) => a.id === v)) return v as AccentId
  return DEFAULT_ACCENT
}

export function setStoredAccent(id: AccentId) {
  localStorage.setItem(ACCENT_STORAGE_KEY, id)
  applyAccent(id)
}

export function AccentProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyAccent(readStoredAccent())
  }, [])
  return <>{children}</>
}
