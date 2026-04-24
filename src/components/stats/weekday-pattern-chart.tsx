'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { DaySummary } from '@/lib/business/balance'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

function weekdayIndex(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00')
  return (d.getDay() + 6) % 7 // Monday = 0 … Sunday = 6
}

export function WeekdayPatternChart({ days }: { days: DaySummary[] }) {
  // Average worked / expected hours per weekday, counting only days that had data
  const buckets: Array<{ worked: number; expected: number; count: number }> = Array.from(
    { length: 7 },
    () => ({ worked: 0, expected: 0, count: 0 })
  )

  for (const d of days) {
    if (d.workedMinutes === 0 && d.expectedMinutes === 0) continue
    const i = weekdayIndex(d.date)
    buckets[i].worked += d.workedMinutes
    buckets[i].expected += d.expectedMinutes
    buckets[i].count += 1
  }

  const data = buckets.map((b, i) => ({
    day: WEEKDAYS[i],
    trabajado: b.count > 0 ? Math.round((b.worked / b.count) / 6) / 10 : 0,
    esperado: b.count > 0 ? Math.round((b.expected / b.count) / 6) / 10 : 0,
  }))

  const allZero = data.every((d) => d.trabajado === 0 && d.esperado === 0)
  if (allZero) {
    return <p className="text-sm text-muted-foreground text-center py-6">Sin datos suficientes para este periodo.</p>
  }

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="h" />
          <Tooltip formatter={(v) => `${v}h`} />
          <Legend />
          <Bar dataKey="esperado" name="Esperado" fill="hsl(var(--muted-foreground))" opacity={0.4} />
          <Bar dataKey="trabajado" name="Trabajado" fill="hsl(var(--primary))" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
