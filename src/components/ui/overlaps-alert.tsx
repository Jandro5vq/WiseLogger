import type { OverlapPair } from '@/lib/business/overlaps'

function fmtTime(ms: number) {
  const d = new Date(ms)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

/**
 * Surfaces pre-existing overlapping tasks/breaks so the user can fix them by hand.
 * The write routes reject new overlaps outright, but data written before that
 * hardening (or restored from a backup) may still contain some — this makes them
 * visible on the one day view that can now edit past pauses (see history/[date]).
 */
export function OverlapsAlert({ pairs }: { pairs: OverlapPair[] }) {
  if (pairs.length === 0) return null

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
      <p className="font-medium text-destructive mb-1">
        {pairs.length === 1 ? '1 solape detectado' : `${pairs.length} solapes detectados`}
        <span className="font-normal text-muted-foreground ml-2">edítalos manualmente para corregirlos</span>
      </p>
      <ul className="space-y-0.5">
        {pairs.map(({ a, b }, i) => (
          <li key={`${a.id}-${b.id}-${i}`} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{a.label}</span> ({fmtTime(a.start)}–{fmtTime(a.end)})
            {' '}se solapa con{' '}
            <span className="font-medium text-foreground">{b.label}</span> ({fmtTime(b.start)}–{fmtTime(b.end)})
          </li>
        ))}
      </ul>
    </div>
  )
}
