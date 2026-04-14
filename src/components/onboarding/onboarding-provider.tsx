'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { OnboardingTour } from './onboarding-tour'

interface Props {
  userId: string
  username: string
  onboardingResetAt: string | null
}

function storageKey(userId: string) {
  return `wl:onboarded:${userId}`
}

/** Demo user always sees the tour and never persists completion. */
function isDemo(username: string) {
  return username.toLowerCase() === 'demo'
}

export function OnboardingProvider({ userId, username, onboardingResetAt }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (pathname !== '/dashboard') return

    if (isDemo(username)) {
      // Demo: show once per browser session, not on every dashboard navigation.
      const sessionKey = `wl:onboarded-session:${userId}`
      if (!sessionStorage.getItem(sessionKey)) {
        setShow(true)
      }
      return
    }

    const done = localStorage.getItem(storageKey(userId))
    if (!done) {
      setShow(true)
      return
    }
    // Admin may have reset onboarding for this user server-side.
    if (onboardingResetAt && done < onboardingResetAt) {
      setShow(true)
    }
  }, [pathname, userId, username, onboardingResetAt])

  useEffect(() => {
    function onStart() {
      if (pathname !== '/dashboard') {
        router.push('/dashboard')
      }
      setShow(true)
    }
    window.addEventListener('wl:start-tour', onStart)
    return () => window.removeEventListener('wl:start-tour', onStart)
  }, [pathname, router])

  const markDone = useCallback(() => {
    if (typeof window !== 'undefined') {
      if (isDemo(username)) {
        sessionStorage.setItem(`wl:onboarded-session:${userId}`, '1')
      } else {
        localStorage.setItem(storageKey(userId), new Date().toISOString())
      }
    }
    setShow(false)
  }, [userId, username])

  if (!show) return null
  return <OnboardingTour onDone={markDone} />
}
