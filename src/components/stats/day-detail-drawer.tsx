'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { formatMinutes } from '@/lib/utils'
import type { TaskWithTags } from '@/types/db'

interface DayDetailPayload {
  date: string
  entry: { id: string; startTime: string | null; endTime: string | null; expectedMinutes: number; notes: string | null } | null
  tasks: TaskWithTags[]
  workedMinutes: number
  dayBalance: number
}

interface DayDetailDrawerProps {
  date: string | null
  onClose: () => void
}

function fmtHeading(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${days[d.getDay()]} ${d.getDate()} de ${months[d.getMonth()]}`
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function taskDuration(t: TaskWithTags): number {
  if (!t.endTime) return 0
  return (new Date(t.endTime).getTime() - new Date(t.startTime).getTime()) / 60_000
}

export function DayDetailDrawer({ date, onClose }: DayDetailDrawerProps) {
  const [data, setData] = useState<DayDetailPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!date) { setData(null); return }
    setLoading(true)
    fetch(`/api/summary/day/${date}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [date])

  useEffect(() => {
    if (!date) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [date, onClose])

  if (!date) return null

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Detalle del día">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        style={{ backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
      />
      <div
        ref={panelRef}
        className="absolute right-0 top-0 bottom-0 w-full sm:w-[28rem] bg-card border-l border-border shadow-xl overflow-y-auto p-5 animate-in slide-in-from-right duration-200"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold capitalize">{fmtHeading(date)}</h2>
            <p className="text-xs text-muted-foreground font-mono">{date}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1.5 hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {loading && (
          <div className="space-y-3">
            <div className="h-16 rounded-md bg-muted animate-pulse" />
            <div className="h-24 rounded-md bg-muted animate-pulse" />
          </div>
        )}

        {!loading && data && !data.entry && (
          <p className="text-sm text-muted-foreground">Sin jornada registrada este día.</p>
        )}

        {!loading && data?.entry && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-md border border-border bg-background p-3">
                <p className="text-xs text-muted-foreground">Trabajado</p>
                <p className="text-lg font-bold">{formatMinutes(data.workedMinutes)}</p>
              </div>
              <div className="rounded-md border border-border bg-background p-3">
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className={`text-lg font-bold ${data.dayBalance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                  {data.dayBalance >= 0 ? '+' : ''}{formatMinutes(data.dayBalance)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              <span>Inicio <span className="font-mono text-foreground">{fmtTime(data.entry.startTime)}</span></span>
              <span>·</span>
              <span>Fin <span className="font-mono text-foreground">{fmtTime(data.entry.endTime)}</span></span>
              <span>·</span>
              <span>Esperado <span className="font-mono text-foreground">{formatMinutes(data.entry.expectedMinutes)}</span></span>
            </div>

            <h3 className="text-sm font-medium mb-2">Tareas ({data.tasks.length})</h3>
            {data.tasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin tareas registradas.</p>
            ) : (
              <ul className="space-y-1.5 mb-4">
                {data.tasks.map((t) => (
                  <li key={t.id} className="rounded-md border border-border/60 bg-background px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate" title={t.description}>{t.description}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {fmtTime(t.startTime)} → {fmtTime(t.endTime)}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-mono font-semibold tabular-nums text-muted-foreground">
                      {formatMinutes(taskDuration(t))}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <Link
              href={`/history/${date}`}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Ver en historial
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
