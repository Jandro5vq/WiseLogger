'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { DaySummary } from '@/lib/business/balance'

export function HoursBarChart({ days }: { days: DaySummary[] }) {
  const data = days.map((d) => ({
    date: d.date.slice(5), // MM-DD
    worked: Math.round(d.workedMinutes / 6) / 10, // hours with 1 decimal
    expected: Math.round(d.expectedMinutes / 6) / 10,
  }))

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="h" />
          <Tooltip formatter={(v) => `${v}h`} />
          <Legend />
          <Bar dataKey="expected" name="Esperado" fill="hsl(var(--muted-foreground))" opacity={0.4} />
          <Bar dataKey="worked" name="Trabajado" fill="hsl(var(--primary))" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
