'use client'

import { useEffect, useRef, useState } from 'react'

interface ConfirmButtonProps {
  /** Runs when the user confirms (second click). */
  onConfirm: () => void
  /** The resting trigger content (e.g. an icon or label). */
  children: React.ReactNode
  /** Short prompt shown while armed, e.g. "¿Eliminar?". */
  confirmLabel?: string
  className?: string
  title?: string
  'aria-label'?: string
}

/**
 * Two-step inline confirmation for destructive actions that shouldn't fire on a
 * single click. First click arms it and swaps in a Sí/No prompt; confirming runs
 * onConfirm, cancelling or ~4s of inactivity disarms it. Used for bulk deletes
 * (whole task group, schedule/break rules) where an undo toast is a weaker guard.
 */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = '¿Eliminar?',
  className = '',
  title,
  'aria-label': ariaLabel,
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  function arm(e: React.MouseEvent) {
    e.stopPropagation()
    setArmed(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setArmed(false), 4000)
  }

  function disarm(e: React.MouseEvent) {
    e.stopPropagation()
    if (timerRef.current) clearTimeout(timerRef.current)
    setArmed(false)
  }

  function confirm(e: React.MouseEvent) {
    e.stopPropagation()
    if (timerRef.current) clearTimeout(timerRef.current)
    setArmed(false)
    onConfirm()
  }

  if (armed) {
    return (
      <span className="flex items-center gap-1 text-xs">
        <span className="text-muted-foreground">{confirmLabel}</span>
        <button
          onClick={confirm}
          className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground hover:bg-destructive/90"
        >
          Sí
        </button>
        <button
          onClick={disarm}
          className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-accent"
        >
          No
        </button>
      </span>
    )
  }

  return (
    <button onClick={arm} className={className} title={title} aria-label={ariaLabel}>
      {children}
    </button>
  )
}
