'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'

interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastOptions {
  /** Optional action button (e.g. "Deshacer"); actionable toasts stay longer. */
  action?: ToastAction
  durationMs?: number
}

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
  action?: ToastAction
}

interface ToastCtx {
  success: (msg: string, options?: ToastOptions) => void
  error: (msg: string, options?: ToastOptions) => void
  info: (msg: string, options?: ToastOptions) => void
}

const ToastContext = createContext<ToastCtx>({
  success: () => {},
  error: () => {},
  info: () => {},
})

export function useToast() {
  return useContext(ToastContext)
}

let nextId = 0

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id)
    if (timer) clearTimeout(timer)
    timersRef.current.delete(id)
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const add = useCallback((message: string, type: Toast['type'], options?: ToastOptions) => {
    const id = ++nextId
    setToasts((prev) => [...prev, { id, message, type, action: options?.action }])
    const duration = options?.durationMs ?? (options?.action ? 6000 : 3500)
    timersRef.current.set(
      id,
      setTimeout(() => dismiss(id), duration)
    )
  }, [dismiss])

  const ctx: ToastCtx = {
    success: useCallback((msg: string, options?: ToastOptions) => add(msg, 'success', options), [add]),
    error: useCallback((msg: string, options?: ToastOptions) => add(msg, 'error', options), [add]),
    info: useCallback((msg: string, options?: ToastOptions) => add(msg, 'info', options), [add]),
  }

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2 rounded-md px-4 py-2 text-sm shadow-lg transition-opacity ${
              t.type === 'error'
                ? 'bg-red-600 text-white'
                : t.type === 'success'
                  ? 'bg-green-600 text-white'
                  : 'bg-card text-foreground border border-border'
            }`}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                onClick={() => { t.action!.onClick(); dismiss(t.id) }}
                className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold underline underline-offset-2 hover:opacity-80"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Cerrar notificación"
              className="shrink-0 -mr-1 rounded p-0.5 opacity-70 hover:opacity-100"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
