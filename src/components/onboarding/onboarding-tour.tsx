'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { TOUR_STEPS, type TourStep, stepTitle, stepBody } from './steps'
import { MESSAGES } from './messages'
import { SHORTCUTS } from '@/components/layout/keyboard-shortcuts'

interface Rect { top: number; left: number; width: number; height: number }

interface Props {
  initialIndex?: number
  onStepChange?: (index: number) => void
  onDone: () => void
}

type AnchorState = 'resolving' | 'found' | 'missing'

const PADDING = 8
const TOOLTIP_WIDTH = 360
const TOOLTIP_GAP = 12
const ANCHOR_TIMEOUT_MS = 2000

export function OnboardingTour({ initialIndex = 0, onStepChange, onDone }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  const [index, setIndex] = useState(initialIndex)
  const [rect, setRect] = useState<Rect | null>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [anchorState, setAnchorState] = useState<AnchorState>('resolving')
  const frameRef = useRef<number | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const primaryBtnRef = useRef<HTMLButtonElement | null>(null)

  const step: TourStep | undefined = TOUR_STEPS[index]
  const total = TOUR_STEPS.length
  const isFirst = index === 0
  const isLast = index === total - 1

  // Sync step index outwards so the provider can persist it.
  useEffect(() => { onStepChange?.(index) }, [index, onStepChange])

  // Route + anchor resolution
  useLayoutEffect(() => {
    if (!step) return
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current)

    if (step.route !== pathname) {
      setAnchorState('resolving')
      setRect(null)
      router.push(step.route)
      return
    }

    if (!step.anchor) {
      setAnchorState('found')
      setRect(null)
      return
    }

    setAnchorState('resolving')
    setRect(null)
    const start = performance.now()
    const tick = () => {
      const el = document.querySelector<HTMLElement>(step.anchor!)
      if (el) {
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
        setAnchorState('found')
        return
      }
      if (performance.now() - start < ANCHOR_TIMEOUT_MS) {
        frameRef.current = requestAnimationFrame(tick)
      } else {
        setAnchorState('missing')
        setRect(null)
      }
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    }
  }, [step, pathname, router])

  // Viewport + reposition on resize/scroll
  useEffect(() => {
    function reposition() {
      setViewport({ w: window.innerWidth, h: window.innerHeight })
      if (!step?.anchor) return
      const el = document.querySelector<HTMLElement>(step.anchor)
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    reposition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [step])

  const next = useCallback(() => {
    setIndex((i) => {
      if (i >= total - 1) { onDone(); return i }
      return i + 1
    })
  }, [total, onDone])

  const prev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : i))
  }, [])

  // Keyboard: Esc + arrow navigation + focus trap
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onDone(); return }
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); return }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); return }
      if (e.key === 'Tab' && tooltipRef.current) {
        const focusable = tooltipRef.current.querySelectorAll<HTMLElement>(
          'button, a[href], input, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement as HTMLElement | null
        if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone, next, prev])

  // Autofocus primary button on each step
  useEffect(() => {
    primaryBtnRef.current?.focus()
  }, [index])

  if (!step) return null

  const showSpotlight = anchorState === 'found' && rect && step.placement !== 'center'
  const showCenter = step.placement === 'center' || anchorState !== 'found'

  // Tooltip position
  let tooltipStyle: React.CSSProperties
  if (showCenter) {
    tooltipStyle = {
      top: viewport.h / 2,
      left: viewport.w / 2,
      transform: 'translate(-50%, -50%)',
      width: Math.min(TOOLTIP_WIDTH, Math.max(viewport.w - 32, 280)),
    }
  } else {
    const r = rect!
    const spaceBelow = viewport.h - (r.top + r.height)
    const spaceAbove = r.top
    const placeBelow = spaceBelow >= 220 || spaceBelow >= spaceAbove
    const width = Math.min(TOOLTIP_WIDTH, viewport.w - 32)
    const rawLeft = r.left + r.width / 2 - width / 2
    const left = Math.max(16, Math.min(rawLeft, viewport.w - width - 16))
    const top = placeBelow
      ? r.top + r.height + TOOLTIP_GAP
      : Math.max(16, r.top - TOOLTIP_GAP)
    tooltipStyle = {
      top,
      left,
      width,
      transform: placeBelow ? undefined : 'translateY(-100%)',
    }
  }

  const primaryLabel = isLast ? MESSAGES.ui.finish : MESSAGES.ui.next

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-label={MESSAGES.ui.tutorialLabel}
    >
      {/* sr-only live announcement */}
      <div role="status" aria-live="polite" className="sr-only">
        {MESSAGES.ui.screenReaderStep(index + 1, total, stepTitle(step))}
      </div>

      {/* Spotlight (anchored) or full backdrop (center / missing) */}
      {showSpotlight ? (
        <div
          className="pointer-events-none absolute rounded-lg tour-spotlight"
          style={{
            top: rect!.top - PADDING,
            left: rect!.left - PADDING,
            width: rect!.width + PADDING * 2,
            height: rect!.height + PADDING * 2,
            transition: 'top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease',
          }}
        />
      ) : (
        <div
          className="absolute inset-0 bg-black/60"
          style={{ backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
        />
      )}

      <div
        ref={tooltipRef}
        key={index}
        className="absolute z-[61] rounded-lg border border-border bg-card p-4 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200"
        style={tooltipStyle}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-base font-semibold">{stepTitle(step)}</h3>
          {step.shortcut && (
            <kbd className="shrink-0 font-mono text-[11px] px-1.5 py-0.5 rounded border border-border bg-muted text-foreground/80">
              {MESSAGES.ui.shortcutPrefix}: {step.shortcut}
            </kbd>
          )}
        </div>

        <p className="text-sm text-muted-foreground mb-3">{stepBody(step)}</p>

        {anchorState === 'missing' && (
          <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
              {MESSAGES.ui.anchorMissingTitle}
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-0.5">
              {MESSAGES.ui.anchorMissingBody}
            </p>
          </div>
        )}

        {step.kind === 'shortcuts-cheatsheet' && (
          <div className="mb-4 grid gap-1.5 rounded-md border border-border bg-muted/40 p-3">
            {SHORTCUTS.map((s) => (
              <div key={s.keys.join('+')} className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <kbd className="font-mono text-xs px-1.5 py-0.5 rounded border border-border bg-background">
                  {s.keys.join(' + ')}
                </kbd>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <span
            className="text-[11px] font-mono text-muted-foreground tabular-nums"
            aria-label={MESSAGES.ui.progressLabel}
          >
            {MESSAGES.ui.stepLabel(index + 1, total)}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDone}
              className="text-xs text-foreground/70 hover:text-foreground transition-colors px-2 py-1 rounded"
            >
              {MESSAGES.ui.skip}
            </button>
            {!isFirst && (
              <button
                type="button"
                onClick={prev}
                aria-keyshortcuts="ArrowLeft"
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent transition-colors"
              >
                {MESSAGES.ui.back}
              </button>
            )}
            <button
              ref={primaryBtnRef}
              type="button"
              onClick={next}
              aria-keyshortcuts="ArrowRight"
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
