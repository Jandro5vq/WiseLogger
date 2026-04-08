'use client'

import { useEffect, useState } from 'react'
import type { TaskWithTags } from '@/types/db'

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtHHMM(ms: number) {
  const d = new Date(ms)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`
  if (m > 0) return `${m}m ${sec.toString().padStart(2, '0')}s`
  return `${sec}s`
}

// ─── palette ─────────────────────────────────────────────────────────────────

const PALETTE = [
  { hex: '#3b82f6', tw: 'text-blue-500'   },
  { hex: '#a855f7', tw: 'text-purple-500' },
  { hex: '#f97316', tw: 'text-orange-500' },
  { hex: '#14b8a6', tw: 'text-teal-500'   },
  { hex: '#ec4899', tw: 'text-pink-500'   },
  { hex: '#eab308', tw: 'text-yellow-500' },
]

const ROW_H   = 32  // px height per swimlane row
const AXIS_H  = 20  // px height for time labels below chart
const TICKS   = 5   // number of time-axis ticks

// ─── component ───────────────────────────────────────────────────────────────

export function DayTimeline({ tasks }: { tasks: TaskWithTags[] }) {
  const [now, setNow] = useState(() => Date.now())
  const hasActive = tasks.some((t) => !t.endTime)

  useEffect(() => {
    if (!hasActive) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [hasActive])

  if (tasks.length === 0) return null

  const segments = [...tasks].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  )

  const spanStart = new Date(segments[0].startTime).getTime()
  const spanEnd = hasActive
    ? now
    : Math.max(...segments.map((t) => new Date(t.endTime!).getTime()))
  const totalSpan = Math.max(spanEnd - spanStart, 1)

  // stable color & row order — first-seen
  const colorIdx = new Map<string, number>()
  const rows: string[] = []
  let ci = 0
  for (const t of segments) {
    if (!colorIdx.has(t.description)) {
      colorIdx.set(t.description, ci++ % PALETTE.length)
      rows.push(t.description)
    }
  }

  // total duration per description
  const totals = new Map<string, number>()
  for (const t of segments) {
    const end = t.endTime ? new Date(t.endTime).getTime() : now
    totals.set(t.description, (totals.get(t.description) ?? 0) + end - new Date(t.startTime).getTime())
  }

  // time axis ticks
  const ticks = Array.from({ length: TICKS }, (_, i) =>
    spanStart + (totalSpan / (TICKS - 1)) * i
  )

  function pct(ms: number) {
    return ((ms - spanStart) / totalSpan) * 100
  }

  const chartH = rows.length * ROW_H

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <h2 className="text-sm font-semibold tracking-wide">Timeline</h2>
        <span className="text-xs text-muted-foreground font-mono">
          {fmtHHMM(spanStart)} – {fmtHHMM(spanEnd)}
          {hasActive && (
            <span className="ml-2 text-primary font-medium animate-pulse">● live</span>
          )}
        </span>
      </div>

      <div className="px-4 pt-3 pb-4 space-y-3">
        {/* ── Gantt chart ── */}
        <div className="flex gap-3">
          {/* label column */}
          <div className="shrink-0 flex flex-col" style={{ width: 110, height: chartH }}>
            {rows.map((desc) => {
              const p = PALETTE[colorIdx.get(desc) ?? 0]
              return (
                <div
                  key={desc}
                  className="flex items-center gap-1.5"
                  style={{ height: ROW_H }}
                >
                  <span
                    className="shrink-0 w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: p.hex }}
                  />
                  <span
                    className="text-xs font-medium truncate text-foreground/80"
                    title={desc}
                    style={{ maxWidth: 88 }}
                  >
                    {desc}
                  </span>
                </div>
              )
            })}
          </div>

          {/* chart area */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* swimlanes */}
            <div className="relative rounded-lg overflow-hidden bg-muted/30" style={{ height: chartH }}>
              {/* alternating row backgrounds */}
              {rows.map((_, i) => (
                <div
                  key={i}
                  className={i % 2 === 0 ? 'absolute inset-x-0 bg-transparent' : 'absolute inset-x-0 bg-muted/20'}
                  style={{ top: i * ROW_H, height: ROW_H }}
                />
              ))}

              {/* grid lines */}
              {ticks.map((t, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 w-px bg-border/40"
                  style={{ left: `${pct(t)}%` }}
                />
              ))}

              {/* bars */}
              {segments.map((task) => {
                const rowI     = rows.indexOf(task.description)
                const tStart   = new Date(task.startTime).getTime()
                const tEnd     = task.endTime ? new Date(task.endTime).getTime() : now
                const left     = pct(tStart)
                const width    = Math.max(pct(tEnd) - pct(tStart), 0.3)
                const color    = PALETTE[colorIdx.get(task.description) ?? 0]
                const isActive = !task.endTime
                const dur      = fmtDuration(tEnd - tStart)

                return (
                  <div
                    key={task.id}
                    title={`${task.description}\n${fmtHHMM(tStart)} → ${task.endTime ? fmtHHMM(tEnd) : '…'}  (${dur})`}
                    className="absolute rounded flex items-center overflow-hidden cursor-default select-none"
                    style={{
                      left:            `${left}%`,
                      width:           `${width}%`,
                      top:             rowI * ROW_H + 5,
                      height:          ROW_H - 10,
                      backgroundColor: color.hex,
                      opacity:         isActive ? 1 : 0.80,
                      transition:      'width 0.4s ease',
                      boxShadow:       isActive ? `0 0 8px 1px ${color.hex}66` : undefined,
                    }}
                  >
                    {width > 5 && (
                      <span className="text-white text-[10px] font-semibold px-1.5 truncate leading-none drop-shadow-sm">
                        {dur}
                      </span>
                    )}
                    {isActive && (
                      <span
                        className="absolute right-1 w-1.5 h-1.5 rounded-full bg-white"
                        style={{ animation: 'ping 1.2s cubic-bezier(0,0,.2,1) infinite', opacity: 0.9 }}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {/* time axis */}
            <div className="relative mt-1" style={{ height: AXIS_H }}>
              {ticks.map((t, i) => (
                <span
                  key={i}
                  className="absolute text-[10px] text-muted-foreground font-mono -translate-x-1/2"
                  style={{ left: `${pct(t)}%` }}
                >
                  {fmtHHMM(t)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── totals legend ── */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-2 border-t border-border/40">
          {rows.map((desc) => {
            const p     = PALETTE[colorIdx.get(desc) ?? 0]
            const total = totals.get(desc) ?? 0
            const live  = tasks.some((t) => t.description === desc && !t.endTime)
            return (
              <div key={desc} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: p.hex }} />
                <span className="text-xs text-muted-foreground truncate max-w-[9rem]" title={desc}>
                  {desc}
                </span>
                <span className={`text-xs font-bold font-mono tabular-nums ${p.tw}`}>
                  {fmtDuration(total)}
                </span>
                {live && (
                  <span className="text-[10px] font-semibold text-primary animate-pulse">↑</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
