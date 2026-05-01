'use client'

import { useMemo } from 'react'
import { computeGaps } from '@/lib/business/gaps'
import { formatMinutes } from '@/lib/utils'
import type { TaskWithTags } from '@/types/db'

interface BreakSlot { startIso: string; endIso: string }

function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export function GapsAlert({ tasks, breaks }: { tasks: TaskWithTags[]; breaks: BreakSlot[] }) {
  const gaps = useMemo(() => computeGaps(tasks, breaks), [tasks, breaks])

  if (gaps.length === 0) return null

  const totalMins = gaps.reduce((s, g) => s + g.durationMinutes, 0)

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
      <p className="font-medium text-amber-600 dark:text-amber-400 mb-1">
        {gaps.length === 1 ? '1 hueco sin asignar' : `${gaps.length} huecos sin asignar`}
        <span className="font-normal text-muted-foreground ml-2">({formatMinutes(totalMins)} en total)</span>
      </p>
      <ul className="space-y-0.5">
        {gaps.map((g) => (
          <li key={g.startIso} className="text-xs text-muted-foreground">
            {fmtTime(g.startIso)} – {fmtTime(g.endIso)}
            <span className="ml-1 text-amber-600/70 dark:text-amber-400/70">({formatMinutes(g.durationMinutes)})</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
