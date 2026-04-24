'use client'

import { useState } from 'react'
import { formatMinutes } from '@/lib/utils'

export interface TopTask {
  description: string
  totalMinutes: number
  sessions: number
}

interface TopTasksListProps {
  tasks: TopTask[]
  initialLimit?: number
}

export function TopTasksList({ tasks, initialLimit = 10 }: TopTasksListProps) {
  const [expanded, setExpanded] = useState(false)

  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">Sin tareas registradas en este periodo.</p>
  }

  const max = tasks[0]?.totalMinutes ?? 1
  const visible = expanded ? tasks : tasks.slice(0, initialLimit)
  const hasMore = tasks.length > initialLimit

  return (
    <div className="space-y-2">
      {visible.map((t) => {
        const pct = Math.max(2, (t.totalMinutes / max) * 100)
        return (
          <div key={t.description} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-xs font-medium truncate" title={t.description}>
                  {t.description}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground font-mono tabular-nums">
                  {formatMinutes(t.totalMinutes)}
                  {t.sessions > 1 && (
                    <span className="ml-1.5 text-muted-foreground/70">×{t.sessions}</span>
                  )}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        )
      })}

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          {expanded ? 'Mostrar menos' : `Ver las ${tasks.length} tareas`}
        </button>
      )}
    </div>
  )
}
