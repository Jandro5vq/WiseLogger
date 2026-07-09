'use client'

import { useEffect } from 'react'

export const ACCENT_STORAGE_KEY = 'wl:accent'
export const ACCENT_CUSTOM_HEX_KEY = 'wl:accent-custom-hex'

export const ACCENTS = [
  { id: 'blue',   label: 'Azul',    hex: '#3b82f6' },
  { id: 'purple', label: 'Violeta', hex: '#a855f7' },
  { id: 'teal',   label: 'Turquesa', hex: '#14b8a6' },
  { id: 'green',  label: 'Verde',   hex: '#22c55e' },
  { id: 'orange', label: 'Naranja', hex: '#f97316' },
  { id: 'pink',   label: 'Rosa',    hex: '#ec4899' },
] as const

export type AccentId = typeof ACCENTS[number]['id'] | 'custom'

export const DEFAULT_ACCENT: AccentId = 'blue'
export const DEFAULT_CUSTOM_HEX = '#3b82f6'

/** Convert a #rrggbb hex color to an "H S% L%" triple matching this app's CSS var format. */
export function hexToHslTriple(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const clean = m ? m[1] : '3b82f6'
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  const d = max - min
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    switch (max) {
      case r: h = ((g - b) / d) % 6; break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4
    }
    h *= 60
    if (h < 0) h += 360
  }
  return `${h.toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%`
}

// Fixed button-text colors used with --primary in each theme (see globals.css
// --primary-foreground). Accent selection never changes these, so contrast is
// checked against them specifically, not against the accent color itself.
const LIGHT_PRIMARY_FOREGROUND_HEX = '#f8fafc'
const DARK_PRIMARY_FOREGROUND_HEX = '#14181f'
// 3:1 is the WCAG AA threshold for large-scale/UI-component text (button
// labels typically qualify), not the stricter 4.5:1 for small body text —
// using 4.5:1 here flagged most of this app's own preset colors as failing.
const WCAG_AA_MIN_RATIO = 3

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const clean = m ? m[1] : '000000'
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ]
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two colors, from 1 (no contrast) to 21 (max). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA)
  const lB = relativeLuminance(hexB)
  const lighter = Math.max(lA, lB)
  const darker = Math.min(lA, lB)
  return (lighter + 0.05) / (darker + 0.05)
}

export interface AccentContrastCheck {
  ratioLight: number
  ratioDark: number
  failsLight: boolean
  failsDark: boolean
}

/** Checks a custom accent hex against the fixed button-text color in each theme. */
export function checkAccentContrast(hex: string): AccentContrastCheck {
  const ratioLight = contrastRatio(hex, LIGHT_PRIMARY_FOREGROUND_HEX)
  const ratioDark = contrastRatio(hex, DARK_PRIMARY_FOREGROUND_HEX)
  return {
    ratioLight,
    ratioDark,
    failsLight: ratioLight < WCAG_AA_MIN_RATIO,
    failsDark: ratioDark < WCAG_AA_MIN_RATIO,
  }
}

function applyAccent(id: AccentId, customHex?: string) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-accent', id)
  if (id === 'custom') {
    const triple = hexToHslTriple(customHex ?? DEFAULT_CUSTOM_HEX)
    root.style.setProperty('--primary', triple)
    root.style.setProperty('--ring', triple)
  } else {
    root.style.removeProperty('--primary')
    root.style.removeProperty('--ring')
  }
}

export function readStoredAccent(): AccentId {
  if (typeof window === 'undefined') return DEFAULT_ACCENT
  const v = localStorage.getItem(ACCENT_STORAGE_KEY)
  if (v === 'custom') return 'custom'
  if (v && ACCENTS.some((a) => a.id === v)) return v as AccentId
  return DEFAULT_ACCENT
}

export function readStoredCustomHex(): string {
  if (typeof window === 'undefined') return DEFAULT_CUSTOM_HEX
  return localStorage.getItem(ACCENT_CUSTOM_HEX_KEY) ?? DEFAULT_CUSTOM_HEX
}

export function setStoredAccent(id: AccentId) {
  localStorage.setItem(ACCENT_STORAGE_KEY, id)
  applyAccent(id, readStoredCustomHex())
}

export function setStoredCustomAccent(hex: string) {
  localStorage.setItem(ACCENT_STORAGE_KEY, 'custom')
  localStorage.setItem(ACCENT_CUSTOM_HEX_KEY, hex)
  applyAccent('custom', hex)
}

export function AccentProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyAccent(readStoredAccent(), readStoredCustomHex())
  }, [])
  return <>{children}</>
}
