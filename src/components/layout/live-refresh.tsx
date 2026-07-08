'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAutoRefresh } from '@/lib/use-auto-refresh'

/**
 * Keeps server-component pages live: re-renders them (router.refresh) when the
 * window regains focus, when the tab becomes visible, and every ~30s while
 * visible — so changes made in another tab, device or via MCP show up without
 * a manual reload.
 */
export function LiveRefresh() {
  const router = useRouter()
  const tick = useAutoRefresh(30_000)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return // the initial render is already fresh
    }
    router.refresh()
  }, [tick, router])

  return null
}
