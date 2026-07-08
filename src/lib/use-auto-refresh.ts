'use client'

import { useEffect, useState } from 'react'

/**
 * Returns a counter that increments when the window regains focus, when the tab
 * becomes visible again, and on a fixed interval while the tab is visible.
 * Include it in a fetch-effect's dependency array to re-run the fetch on those
 * signals, so data stays live without a manual reload.
 */
export function useAutoRefresh(intervalMs = 30_000): number {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const bump = () => setTick((t) => t + 1)

    function onVisibility() {
      if (document.visibilityState === 'visible') bump()
    }

    const id = setInterval(() => {
      if (document.visibilityState === 'visible') bump()
    }, intervalMs)

    window.addEventListener('focus', bump)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', bump)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs])

  return tick
}
