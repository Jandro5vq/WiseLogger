'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { TimeInput } from '@/components/ui/time-input'
import { PenSquare, Cancel, Plus } from 'pixelarticons/react'
import { useToast } from '@/components/ui/toast'

interface EntryBreak {
  id: string
  breakStart: string   // UTC ISO string (new) or 'HH:MM' (legacy rule-seeded)
  durationMinutes: number
  label: string | null
  fromRuleId: string | null
}

const QUICK_DURATIONS = [15, 30, 60]

/** Extract local HH:MM from a UTC ISO string or return the raw HH:MM for legacy breaks */
function toLocalHHMM(breakStart: string): string {
  if (breakStart.length > 5) {
    const d = new Date(breakStart)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }
  return breakStart
}

/** Convert a local HH:MM input + entry date to a UTC ISO string (runs in browser) */
function localTimeToISO(entryDate: string, time: string): string {
  return new Date(`${entryDate}T${time}:00`).toISOString()
}

/** Current local time as HH:MM, used to default the "add break" form. */
function nowHHMM(): string {
  const d = new Date()
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

/**
 * Add/edit form for one break. With `initial` it PATCHes that break, otherwise it
 * POSTs a new one to the entry. Server errors are shown inline and keep the form open.
 */
function BreakForm({
  initial,
  entryId,
  entryDate,
  onSave,
  onCancel,
}: {
  initial?: EntryBreak
  entryId: string
  entryDate: string
  onSave: (b: EntryBreak, deletedDescriptions: string[]) => void
  onCancel: () => void
}) {
  const [breakStart, setBreakStart] = useState(() => initial ? toLocalHHMM(initial.breakStart) : nowHHMM())
  const [duration, setDuration] = useState(String(initial?.durationMinutes ?? 30))
  const [label, setLabel] = useState(initial?.label ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch(initial ? `/api/breaks/${initial.id}` : `/api/entries/${entryId}/breaks`, {
      method: initial ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        breakStart: localTimeToISO(entryDate, breakStart),
        durationMinutes: parseInt(duration),
        label: label || null,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setError(data.error ?? (initial ? 'No se pudo guardar la pausa' : 'No se pudo añadir la pausa'))
      return
    }
    onSave(data.break, data.deletedDescriptions ?? [])
  }

  const inputClass = 'rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <form onSubmit={save} className="space-y-1.5 pt-1">
      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Hora</label>
          <TimeInput value={breakStart} onChange={setBreakStart} required showNow={!initial} className={inputClass} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Duración (min)</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={480}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              required
              aria-label="Duración en minutos"
              className={`w-16 ${inputClass}`}
            />
            {QUICK_DURATIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDuration(String(m))}
                aria-pressed={duration === String(m)}
                className={`rounded border px-1.5 py-1 text-xs tabular-nums transition-colors ${
                  duration === String(m)
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-w-[8rem]">
          <label className="text-xs text-muted-foreground block mb-1">Etiqueta</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="p. ej. Comida"
            className={`w-full ${inputClass}`}
          />
        </div>
        <div className="flex gap-1.5 pb-0.5">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : initial ? 'Guardar' : 'Añadir'}
          </button>
          <button type="button" onClick={onCancel} className="rounded border border-border px-3 py-1 text-xs hover:bg-accent">
            Cancelar
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  )
}

export function BreaksPanel({
  entryId,
  entryDate,
  initialBreaks,
}: {
  entryId: string
  entryDate: string
  initialBreaks: EntryBreak[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const toast = useToast()
  const [breaks, setBreaks] = useState<EntryBreak[]>(initialBreaks)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Server refreshes (router.refresh / LiveRefresh) deliver fresh breaks via props;
  // resync so the panel never shows stale rows after an external change.
  useEffect(() => { setBreaks(initialBreaks) }, [initialBreaks])

  // Clicking a break on the timeline opens it here for editing.
  useEffect(() => {
    function handleEdit(e: Event) {
      const id = (e as CustomEvent<string>).detail
      if (!initialBreaks.some((b) => b.id === id)) return
      setEditingId(id)
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    window.addEventListener('wl:edit-break', handleEdit)
    return () => window.removeEventListener('wl:edit-break', handleEdit)
  }, [initialBreaks])

  const total = breaks.reduce((s, b) => s + b.durationMinutes, 0)

  function notifyPisadas(descriptions: string[]) {
    const unique = Array.from(new Set(descriptions))
    for (const desc of unique) {
      toast.info(`«${desc}» fue eliminada al quedar completamente cubierta`)
    }
  }

  function handleAdded(created: EntryBreak, deletedDescriptions: string[]) {
    setBreaks((prev) => [...prev, created])
    notifyPisadas(deletedDescriptions)
    setShowAdd(false)
    startTransition(() => router.refresh())
  }

  function handleEdited(updated: EntryBreak, deletedDescriptions: string[]) {
    notifyPisadas(deletedDescriptions)
    setBreaks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
    setEditingId(null)
    startTransition(() => router.refresh())
  }

  async function deleteBreak(id: string) {
    const removed = breaks.find((b) => b.id === id)
    const res = await fetch(`/api/breaks/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Error al eliminar la pausa'); return }
    setBreaks((prev) => prev.filter((b) => b.id !== id))
    startTransition(() => router.refresh())
    if (!removed) return
    toast.info('Pausa eliminada', {
      action: {
        label: 'Deshacer',
        onClick: async () => {
          // Re-create via POST — re-runs the carve logic, same as any new break.
          const r = await fetch(`/api/entries/${entryId}/breaks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              breakStart: removed.breakStart,
              durationMinutes: removed.durationMinutes,
              label: removed.label ?? null,
            }),
          })
          const data = await r.json().catch(() => ({}))
          if (!r.ok) { toast.error(data.error ?? 'No se pudo restaurar la pausa'); return }
          if (data.break) setBreaks((prev) => [...prev, data.break])
          startTransition(() => router.refresh())
        },
      },
    })
  }

  const sorted = [...breaks].sort((a, b) => toLocalHHMM(a.breakStart).localeCompare(toLocalHHMM(b.breakStart)))

  return (
    <div ref={panelRef} data-tour="breaks" className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">Pausas</h2>
          {total > 0 && (
            <span className="text-xs text-muted-foreground font-mono">
              {total}m total
            </span>
          )}
        </div>
        {!showAdd && (
          <button
            onClick={() => { setEditingId(null); setShowAdd(true) }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus width={14} height={14} />
            Añadir pausa
          </button>
        )}
      </div>

      <div className="p-4 space-y-2">
        {breaks.length === 0 && !showAdd && (
          <p className="text-xs text-muted-foreground text-center py-2">Sin pausas este día.</p>
        )}

        {sorted.map((b) => (
          <div key={b.id}>
            {editingId === b.id ? (
              <BreakForm
                initial={b}
                entryId={entryId}
                entryDate={entryDate}
                onSave={handleEdited}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs text-muted-foreground w-10 shrink-0">{toLocalHHMM(b.breakStart)}</span>
                  <span className="font-medium tabular-nums shrink-0">{b.durationMinutes}m</span>
                  {b.label && <span className="text-muted-foreground truncate">{b.label}</span>}
                  {b.fromRuleId && (
                    <span className="text-[10px] text-muted-foreground/60 border border-border rounded px-1 shrink-0">auto</span>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setEditingId(b.id)}
                    className="text-muted-foreground hover:text-foreground p-0.5"
                    aria-label="Editar pausa" title="Editar pausa"
                  >
                    <PenSquare width={16} height={16} />
                  </button>
                  <button
                    onClick={() => deleteBreak(b.id)}
                    className="text-muted-foreground hover:text-destructive p-0.5"
                    aria-label="Eliminar pausa" title="Eliminar pausa"
                  >
                    <Cancel width={16} height={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {showAdd && (
          <BreakForm
            entryId={entryId}
            entryDate={entryDate}
            onSave={handleAdded}
            onCancel={() => setShowAdd(false)}
          />
        )}
      </div>
    </div>
  )
}
