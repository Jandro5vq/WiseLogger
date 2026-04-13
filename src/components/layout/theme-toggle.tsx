'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Lightbulb, Moon, Monitor } from 'pixelarticons/react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const themes = ['light', 'dark', 'system'] as const
  const Icons = { light: Lightbulb, dark: Moon, system: Monitor }
  const current = (theme ?? 'system') as 'light' | 'dark' | 'system'
  const next = themes[(themes.indexOf(current) + 1) % themes.length]
  const Icon = Icons[current]

  return (
    <button
      onClick={() => setTheme(next)}
      className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      title={`Theme: ${current}`}
    >
      <Icon width={20} height={20} />
    </button>
  )
}
