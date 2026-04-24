'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { OnboardingTour } from './onboarding-tour'
import { TOUR_STEPS } from './steps'

interface Props {
  userId: string
  username: string
  onboardingResetAt: string | null
}

const storageDone   = (u: string) => `wl:onboarded:${u}`
const storageDemo   = (u: string) => `wl:onboarded-session:${u}`
const storageActive = (u: string) => `wl:tour-active:${u}`
const storageStep   = (u: string) => `wl:tour-step:${u}`

/** Demo user always sees the tour and never persists completion to localStorage. */
function isDemo(username: string) {
  return username.toLowerCase() === 'demo'
}

export function OnboardingProvider({ userId, username, onboardingResetAt }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [active, setActive] = useState(false)
  const [initialStep, setInitialStep] = useState(0)
  const bootstrapped = useRef(false)

  // Bootstrap on first render: resume an in-flight tour or auto-start on first visit.
  useEffect(() => {
    if (bootstrapped.current) return
    if (typeof window === 'undefined') return

    const resumingActive = sessionStorage.getItem(storageActive(userId)) === '1'
    if (resumingActive) {
      const storedStep = parseInt(sessionStorage.getItem(storageStep(userId)) ?? '0', 10)
      const safeStep = Number.isFinite(storedStep)
        ? Math.max(0, Math.min(storedStep, TOUR_STEPS.length - 1))
        : 0
      setInitialStep(safeStep)
      setActive(true)
      bootstrapped.current = true
      return
    }

    // Auto-start only when landing on /dashboard (the first step's route) for the first time
    if (pathname !== '/dashboard') return

    let needsAutoStart = false
    if (isDemo(username)) {
      needsAutoStart = !sessionStorage.getItem(storageDemo(userId))
    } else {
      const done = localStorage.getItem(storageDone(userId))
      needsAutoStart = !done || (onboardingResetAt != null && done < onboardingResetAt)
    }

    if (needsAutoStart) {
      sessionStorage.setItem(storageActive(userId), '1')
      sessionStorage.setItem(storageStep(userId), '0')
      setInitialStep(0)
      setActive(true)
    }
    bootstrapped.current = true
  }, [pathname, userId, username, onboardingResetAt])

  // External trigger: "Rehacer tutorial" button in Settings dispatches `wl:start-tour`.
  useEffect(() => {
    function onStart() {
      sessionStorage.setItem(storageActive(userId), '1')
      sessionStorage.setItem(storageStep(userId), '0')
      setInitialStep(0)
      setActive(true)
      if (pathname !== TOUR_STEPS[0].route) router.push(TOUR_STEPS[0].route)
    }
    window.addEventListener('wl:start-tour', onStart)
    return () => window.removeEventListener('wl:start-tour', onStart)
  }, [pathname, router, userId])

  const persistStep = useCallback((index: number) => {
    sessionStorage.setItem(storageStep(userId), String(index))
  }, [userId])

  const markDone = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(storageActive(userId))
      sessionStorage.removeItem(storageStep(userId))
      if (isDemo(username)) {
        sessionStorage.setItem(storageDemo(userId), '1')
      } else {
        localStorage.setItem(storageDone(userId), new Date().toISOString())
      }
    }
    setActive(false)
  }, [userId, username])

  if (!active) return null
  return <OnboardingTour initialIndex={initialStep} onStepChange={persistStep} onDone={markDone} />
}
