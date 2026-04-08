'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface EntryBreak {
  id: string
  breakStart: string   // 'HH:MM'
  durationMinutes: number
  label: string | null
  fromRuleId: string | null
}

function BreakForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: EntryBreak
  onSave: (b: EntryBreak) => void
  onCancel: () => void
}) {
  const [breakStart, setBreakStart] = useState(initial?.breakStart ?? '')
  const [duration, setDuration] = useState(String(initial?.durationMinutes ?? 30))
  const [label, setLabel] = useState(initial?.label ?? '')
  const [saving, setSaving] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const body = { breakStart, durationMinutes: parseInt(duration), label: label || null }
    const url = initial ? `/api/breaks/${initial.id}` : undefined
    // url is set by parent for POST (entryId required)
    if (initial) {
      const res = await fetch(url!, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setSaving(false)
      if (res.ok) onSave(data)
    }
  }

  return (
    <form onSubmit={save} className="flex items-end gap-2 flex-wrap">
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Time</label>
        <input
          type="time"
          value={breakStart}
          onChange={(e) => setBreakStart(e.target.value)}
          required
          className="rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Duration (min)</label>
        <input
          type="number"
          min={1}
          max={480}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          required
          className="w-20 rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="flex-1 min-w-[8rem]">
        <label className="text-xs text-muted-foreground block mb-1">Label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Lunch"
          className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="flex gap-1.5 pb-0.5">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-border px-3 py-1 text-xs hover:bg-accent">
          Cancel
        </button>
      </div>
    </form>
  )
}

export function BreaksPanel({
  entryId,
  initialBreaks,
}: {
  entryId: string
  initialBreaks: EntryBreak[]
}) {
  const router = useRouter()
  const [breaks, setBreaks] = useState<EntryBreak[]>(initialBreaks)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // add form local state
  const [addStart, setAddStart] = useState('')
  const [addDuration, setAddDuration] = useState('30')
  const [addLabel, setAddLabel] = useState('')
  const [adding, setAdding] = useState(false)

  const total = breaks.reduce((s, b) => s + b.durationMinutes, 0)

  async function addBreak(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    const res = await fetch(`/api/entries/${entryId}/breaks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ breakStart: addStart, durationMinutes: parseInt(addDuration), label: addLabel || null }),
    })
    const data = await res.json()
    setAdding(false)
    if (res.ok) {
      setBreaks((prev) => [...prev, data])
      setAddStart('')
      setAddDuration('30')
      setAddLabel('')
      setShowAdd(false)
      router.refresh()
    }
  }

  async function deleteBreak(id: string) {
    await fetch(`/api/breaks/${id}`, { method: 'DELETE' })
    setBreaks((prev) => prev.filter((b) => b.id !== id))
    router.refresh()
  }

  function handleEdited(updated: EntryBreak) {
    setBreaks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
    setEditingId(null)
    router.refresh()
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">Breaks</h2>
          {total > 0 && (
            <span className="text-xs text-muted-foreground font-mono">
              {total}m total
            </span>
          )}
        </div>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            + Add break
          </button>
        )}
      </div>

      <div className="p-4 space-y-2">
        {breaks.length === 0 && !showAdd && (
          <p className="text-xs text-muted-foreground text-center py-2">No breaks scheduled today.</p>
        )}

        {breaks.map((b) => (
          <div key={b.id}>
            {editingId === b.id ? (
              <BreakForm
                initial={b}
                onSave={handleEdited}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground w-10">{b.breakStart}</span>
                  <span className="font-medium tabular-nums">{b.durationMinutes}m</span>
                  {b.label && <span className="text-muted-foreground">{b.label}</span>}
                  {b.fromRuleId && (
                    <span className="text-[10px] text-muted-foreground/60 border border-border rounded px-1">auto</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingId(b.id)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => deleteBreak(b.id)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {showAdd && (
          <form onSubmit={addBreak} className="flex items-end gap-2 flex-wrap pt-1">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Time</label>
              <input
                type="time"
                value={addStart}
                onChange={(e) => setAddStart(e.target.value)}
                required
                autoFocus
                className="rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Duration (min)</label>
              <input
                type="number"
                min={1}
                max={480}
                value={addDuration}
                onChange={(e) => setAddDuration(e.target.value)}
                required
                className="w-20 rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex-1 min-w-[8rem]">
              <label className="text-xs text-muted-foreground block mb-1">Label</label>
              <input
                type="text"
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                placeholder="e.g. Lunch"
                className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex gap-1.5 pb-0.5">
              <button
                type="submit"
                disabled={adding}
                className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {adding ? 'Adding…' : 'Add'}
              </button>
              <button type="button" onClick={() => setShowAdd(false)} className="rounded border border-border px-3 py-1 text-xs hover:bg-accent">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
