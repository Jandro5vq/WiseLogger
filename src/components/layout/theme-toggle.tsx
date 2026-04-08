'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const themes = ['light', 'dark', 'system'] as const
  const icons = { light: '☀️', dark: '🌙', system: '💻' }
  const current = (theme ?? 'system') as 'light' | 'dark' | 'system'
  const next = themes[(themes.indexOf(current) + 1) % themes.length]

  return (
    <button
      onClick={() => setTheme(next)}
      className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      title={`Theme: ${current}`}
    >
      {icons[current]}
    </button>
  )
}
