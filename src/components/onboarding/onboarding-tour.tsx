'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TOUR_STEPS, type TourStep } from './steps'

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

interface Props {
  onDone: () => void
}

const PADDING = 8
const TOOLTIP_WIDTH = 340
const TOOLTIP_GAP = 12

export function OnboardingTour({ onDone }: Props) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const frameRef = useRef<number | null>(null)

  const step: TourStep | undefined = TOUR_STEPS[index]

  const resolveAnchor = useCallback(() => {
    if (!step) return
    if (!step.anchor) {
      setRect(null)
      return
    }
    const start = performance.now()
    const tick = () => {
      const el = document.querySelector<HTMLElement>(step.anchor!)
      if (el) {
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
        return
      }
      if (performance.now() - start < 1000) {
        frameRef.current = requestAnimationFrame(tick)
      } else {
        setRect(null)
      }
    }
    frameRef.current = requestAnimationFrame(tick)
  }, [step])

  useLayoutEffect(() => {
    setViewport({ w: window.innerWidth, h: window.innerHeight })
    resolveAnchor()
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    }
  }, [resolveAnchor])

  useEffect(() => {
    function reposition() {
      setViewport({ w: window.innerWidth, h: window.innerHeight })
      if (!step?.anchor) return
      const el = document.querySelector<HTMLElement>(step.anchor)
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [step])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  if (!step) return null

  const isLast = index === TOUR_STEPS.length - 1
  const isFirst = index === 0

  function next() {
    if (isLast) {
      if (step?.id === 'settings-link') {
        onDone()
        router.push('/settings')
        return
      }
      onDone()
      return
    }
    setIndex((i) => i + 1)
  }

  function prev() {
    if (!isFirst) setIndex((i) => i - 1)
  }

  // Tooltip position
  let tooltipStyle: React.CSSProperties
  if (step.placement === 'center' || !rect) {
    tooltipStyle = {
      top: viewport.h / 2,
      left: viewport.w / 2,
      transform: 'translate(-50%, -50%)',
      width: Math.min(TOOLTIP_WIDTH, viewport.w - 32),
    }
  } else {
    const spaceBelow = viewport.h - (rect.top + rect.height)
    const spaceAbove = rect.top
    const placeBelow = spaceBelow >= 200 || spaceBelow >= spaceAbove
    const width = Math.min(TOOLTIP_WIDTH, viewport.w - 32)
    const rawLeft = rect.left + rect.width / 2 - width / 2
    const left = Math.max(16, Math.min(rawLeft, viewport.w - width - 16))
    const top = placeBelow
      ? rect.top + rect.height + TOOLTIP_GAP
      : Math.max(16, rect.top - TOOLTIP_GAP)
    tooltipStyle = {
      top,
      left,
      width,
      transform: placeBelow ? undefined : 'translateY(-100%)',
    }
  }

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Tutorial">
      {/* Spotlight via big box-shadow */}
      {rect && step.placement !== 'center' ? (
        <div
          className="pointer-events-none absolute rounded-lg transition-all"
          style={{
            top: rect.top - PADDING,
            left: rect.left - PADDING,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}

      <div
        className="absolute z-[61] rounded-lg border border-border bg-card p-4 shadow-xl"
        style={tooltipStyle}
      >
        <h3 className="text-base font-semibold mb-1">{step.title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{step.body}</p>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-label="Progreso">
            {TOUR_STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === index ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDone}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
            >
              Saltar
            </button>
            {!isFirst && (
              <button
                type="button"
                onClick={prev}
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent transition-colors"
              >
                Atrás
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              {isLast ? (step.id === 'settings-link' ? 'Ir a Ajustes' : 'Finalizar') : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
