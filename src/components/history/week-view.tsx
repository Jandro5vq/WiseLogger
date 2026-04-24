'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { formatMinutes } from '@/lib/utils'
import type { TaskWithTags } from '@/types/db'
import { ArrowLeftBox, ArrowRightBox } from 'pixelarticons/react'
import { useToast } from '@/components/ui/toast'

const BILLED_KEY = 'wl:billed'
const BILLED_VERSION_KEY = 'wl:billedVersion'
const BILLED_VERSION = '2'

type BilledMap = Map<string, string> // `date::description` → signature

function loadBilled(): BilledMap {
  if (typeof window === 'undefined') return new Map()
  try {
    // Drop legacy v1 data (was a plain string[])
    if (localStorage.getItem(BILLED_VERSION_KEY) !== BILLED_VERSION) {
      localStorage.removeItem(BILLED_KEY)
      localStorage.setItem(BILLED_VERSION_KEY, BILLED_VERSION)
      return new Map()
    }
    const raw = localStorage.getItem(BILLED_KEY)
    if (!raw) return new Map()
    const obj = JSON.parse(raw) as Record<string, string>
    // Prune entries older than 8 weeks
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 56)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const map = new Map<string, string>()
    for (const [k, v] of Object.entries(obj)) {
      if (k.slice(0, 10) >= cutoffStr) map.set(k, v)
    }
    if (map.size < Object.keys(obj).length) saveBilled(map)
    return map
  } catch { return new Map() }
}

function saveBilled(map: BilledMap) {
  const obj: Record<string, string> = {}
  map.forEach((v, k) => { obj[k] = v })
  localStorage.setItem(BILLED_KEY, JSON.stringify(obj))
  localStorage.setItem(BILLED_VERSION_KEY, BILLED_VERSION)
}

function billedKey(date: string, description: string) {
  return `${date}::${description}`
}

function djb2(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function groupSignature(tasks: TaskWithTags[]): string {
  const parts = [...tasks]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((t) => [
      t.id,
      t.startTime,
      t.endTime ?? '',
      (t.tags ?? []).join(','),
      t.notes ?? '',
      t.description,
    ].join('|'))
    .join('\n')
  return djb2(parts)
}

// Use local date to avoid UTC offset shifting the day
function localDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function CopyButton({ text, title = 'Copiar' }: { text: string; title?: string }) {
  const [copied, setCopied] = useState(false)

  function copy(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button
      onClick={copy}
      title={title}
      className="shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
    >
      {copied ? (
        <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">✓</span>
      ) : (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      )}
    </button>
  )
}

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

interface DayData {
  date: string
  entry: { id: string; expectedMinutes: number; endTime: string | null } | null
  tasks: TaskWithTags[]
  workedMinutes: number
  expectedMinutes: number
  dayBalance: number
}

interface WeekData {
  from: string
  to: string
  days: DayData[]
  totalWorkedMinutes: number
  totalExpectedMinutes: number
  weekBalance: number
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d.getDate()} ${months[d.getMonth()]}`
}

function isToday(dateStr: string): boolean {
  return dateStr === localDate(new Date())
}

// Group tasks by description, compute total per group
interface TaskGroup {
  description: string
  tags: string[]
  totalMinutes: number
  sessions: number
  notes: string | null
  signature: string
}

function groupTasks(tasks: TaskWithTags[]): TaskGroup[] {
  const map = new Map<string, { tags: string[]; totalMs: number; sessions: number; notes: string | null; tasks: TaskWithTags[] }>()
  for (const t of tasks) {
    if (!t.endTime) continue
    const ms = new Date(t.endTime).getTime() - new Date(t.startTime).getTime()
    const existing = map.get(t.description)
    if (existing) {
      existing.totalMs += ms
      existing.sessions++
      existing.tasks.push(t)
      // Keep latest non-null notes
      if (t.notes) existing.notes = t.notes
    } else {
      map.set(t.description, { tags: t.tags, totalMs: ms, sessions: 1, notes: t.notes, tasks: [t] })
    }
  }
  return Array.from(map.entries()).map(([description, v]) => ({
    description,
    tags: v.tags,
    totalMinutes: v.totalMs / 60000,
    sessions: v.sessions,
    notes: v.notes,
    signature: groupSignature(v.tasks),
  }))
}

function DayCard({ day, index, billed, onToggleBilled }: {
  day: DayData; index: number
  billed: BilledMap
  onToggleBilled: (date: string, description: string, signature: string) => void
}) {
  const today = isToday(day.date)
  const hasWork = day.workedMinutes > 0 || day.tasks.length > 0
  const groups = groupTasks(day.tasks)
  const progress = day.expectedMinutes > 0
    ? Math.min((day.workedMinutes / day.expectedMinutes) * 100, 100)
    : 0

  return (
    <div className={`rounded-xl border bg-card overflow-hidden flex flex-col ${today ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border'}`}>
      {/* day header */}
      <Link
        href={`/history/${day.date}`}
        className="flex items-center justify-between px-4 py-3 border-b border-border/60 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${today ? 'text-primary' : ''}`}>
            {DAY_NAMES[index]}
          </span>
          <span className="text-xs text-muted-foreground">{fmtDate(day.date)}</span>
          {today && <span className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5 font-medium">Hoy</span>}
        </div>
        <div className="flex items-center gap-3 text-xs">
          {hasWork ? (
            <>
              <span className="font-mono font-medium tabular-nums">{formatMinutes(day.workedMinutes)}</span>
              <span className={`font-mono font-semibold tabular-nums ${day.dayBalance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                {day.dayBalance >= 0 ? '+' : ''}{formatMinutes(day.dayBalance)}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground/50 text-xs">sin datos</span>
          )}
          <ArrowRightBox width={16} height={16} className="text-muted-foreground" />
        </div>
      </Link>

      {/* progress bar */}
      {day.expectedMinutes > 0 && (
        <div className="h-0.5 bg-muted">
          <div
            className={`h-0.5 transition-all ${day.dayBalance >= 0 ? 'bg-green-500' : 'bg-primary'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* task groups */}
      <div className="flex-1 px-4 py-3 space-y-1.5">
        {groups.length === 0 ? (
          <p className="text-xs text-muted-foreground/50 text-center py-3">—</p>
        ) : (
          groups.map((g) => {
            const isBilled = billed.get(billedKey(day.date, g.description)) === g.signature
            return (
              <div key={g.description} className={`flex items-center justify-between gap-2 group/row ${isBilled ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-1.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={isBilled}
                    onChange={() => onToggleBilled(day.date, g.description, g.signature)}
                    title="Marcar como imputada"
                    className="h-3 w-3 rounded border-muted-foreground/40 accent-primary shrink-0 cursor-pointer"
                  />
                  <span className={`text-xs font-medium truncate ${isBilled ? 'line-through' : ''}`} title={g.description}>{g.description}</span>
                  <CopyButton text={g.notes ?? g.description} title={g.notes ? 'Copiar notas' : 'Copiar descripción'} />
                  {g.sessions > 1 && (
                    <span className="text-[10px] text-muted-foreground shrink-0">×{g.sessions}</span>
                  )}
                  {g.tags.map((tag) => (
                    <span key={tag} className="text-[10px] bg-secondary rounded px-1 py-0.5 shrink-0">{tag}</span>
                  ))}
                </div>
                <span className="text-xs font-mono font-semibold tabular-nums text-muted-foreground shrink-0">
                  {formatMinutes(g.totalMinutes)}
                </span>
              </div>
            )
          })

        )}
      </div>
    </div>
  )
}

function addWeeks(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n * 7)
  return localDate(d)
}

const WEEKEND_KEY = 'wl:showWeekends'

export function WeekView() {
  const toast = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [anchorDate, setAnchorDate] = useState(() => searchParams.get('week') ?? localDate(new Date()))
  const [data, setData] = useState<WeekData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showWeekends, setShowWeekends] = useState(false)
  const [billed, setBilled] = useState<BilledMap>(() => new Map())
  const billedRef = useRef(billed)
  useEffect(() => { billedRef.current = billed }, [billed])

  // Hydrate browser-only preferences after mount to avoid SSR/client divergence.
  useEffect(() => {
    setShowWeekends(localStorage.getItem(WEEKEND_KEY) === 'true')
    setBilled(loadBilled())
  }, [])

  const toggleBilled = useCallback((date: string, description: string, signature: string) => {
    setBilled((prev) => {
      const next = new Map(prev)
      const key = billedKey(date, description)
      if (next.get(key) === signature) next.delete(key)
      else next.set(key, signature)
      saveBilled(next)
      return next
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/summary/week-tasks?date=${anchorDate}`)
      .then((r) => r.json())
      .then((d: WeekData) => {
        setData(d)
        setLoading(false)

        // Detect billed entries whose underlying tasks changed
        const currentSigs = new Map<string, string>()
        for (const day of d.days) {
          for (const g of groupTasks(day.tasks)) {
            currentSigs.set(billedKey(day.date, g.description), g.signature)
          }
        }
        const stale: string[] = []
        billedRef.current.forEach((sig, key) => {
          const dateStr = key.slice(0, 10)
          if (dateStr < d.from || dateStr > d.to) return
          const current = currentSigs.get(key)
          if (current === undefined || current !== sig) stale.push(key)
        })
        if (stale.length > 0) {
          setBilled((prev) => {
            const next = new Map(prev)
            for (const k of stale) next.delete(k)
            saveBilled(next)
            return next
          })
          toast.info(stale.length === 1
            ? 'Se desmarcó 1 tarea imputada porque fue modificada'
            : `Se desmarcaron ${stale.length} tareas imputadas porque fueron modificadas`)
        }
      })
      .catch(() => { setLoading(false); toast.error('Error al cargar la semana') })
  }, [anchorDate, toast])

  function navigate(n: number) {
    setAnchorDate((prev) => {
      const next = addWeeks(prev, n)
      router.replace(`?week=${next}`, { scroll: false })
      return next
    })
  }

  function toggleWeekends() {
    setShowWeekends((v) => {
      const next = !v
      localStorage.setItem(WEEKEND_KEY, String(next))
      return next
    })
  }

  const isCurrentWeek = data
    ? localDate(new Date()) >= data.from &&
      localDate(new Date()) <= data.to
    : false

  // Filter days: Mon-Fri (index 0-4) unless showWeekends
  const visibleDays = data
    ? data.days.filter((_, i) => showWeekends || i < 5)
    : []

  return (
    <div className="space-y-4">
      {/* week navigation */}
      <div data-tour="week-nav" className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="rounded-md p-2 hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftBox width={24} height={24} />
        </button>
        <div className="text-center">
          {data ? (
            <div>
              <p className="text-sm font-semibold">
                {fmtDate(data.from)} – {fmtDate(data.to)}
              </p>
              {isCurrentWeek && <p className="text-xs text-primary font-medium">Esta semana</p>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          )}
        </div>
        <button
          onClick={() => navigate(1)}
          disabled={isCurrentWeek}
          className="rounded-md p-2 hover:bg-accent transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowRightBox width={24} height={24} />
        </button>
      </div>

      {/* day cards — vertical column */}
      {loading && (
        <div className="text-center py-12 text-muted-foreground text-sm">Cargando…</div>
      )}
      {data && !loading && (
        <div className="flex flex-col gap-3 max-w-3xl mx-auto">
          {visibleDays.map((day, i) => (
            <DayCard key={day.date} day={day} index={i} billed={billed} onToggleBilled={toggleBilled} />
          ))}
        </div>
      )}
    </div>
  )
}
