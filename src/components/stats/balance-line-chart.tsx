'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { DaySummary } from '@/lib/business/balance'

export function BalanceLineChart({ days }: { days: DaySummary[] }) {
  let cumulative = 0
  const data = days.map((d) => {
    cumulative += d.dayBalance
    return {
      date: d.date.slice(5),
      balance: Math.round(cumulative / 6) / 10, // hours
    }
  })

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="h" />
          <Tooltip formatter={(v) => `${v}h`} />
          <ReferenceLine y={0} stroke="hsl(var(--border))" />
          <Line
            type="monotone"
            dataKey="balance"
            name="Balance acumulado"
            stroke="hsl(var(--primary))"
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
