'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { formatMinutes, isoToLocalInput } from '@/lib/utils'
import type { TaskWithTags } from '@/types/db'
import { DateTimeInput } from '@/components/ui/date-time-input'
import { Play, PenSquare, PlusBox, Note } from 'pixelarticons/react'
import { useToast } from '@/components/ui/toast'
import { loadBilled, saveBilled, billedKey, groupSignature, type BilledMap } from '@/lib/billed'

function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="currentColor" viewBox="0 0 24 24">
      <path d="M18 22H6V20H18V22ZM9 6H15V4H17V6H22V8H20V20H18V8H6V20H4V8H2V6H7V4H9V6ZM15 4H9V2H15V4Z" />
    </svg>
  )
}

// ─── edit form for a single segment ──────────────────────────────────────────

function EditTaskForm({ task, onDone, siblingIds }: { task: TaskWithTags; onDone: () => void; siblingIds?: string[] }) {
  const router = useRouter()
  const toast = useToast()
  const [description, setDescription] = useState(task.description)
  const [notes, setNotes] = useState(task.notes ?? '')
  const [tagsInput, setTagsInput] = useState(task.tags.join(', '))
  const [startTime, setStartTime] = useState(isoToLocalInput(task.startTime))
  const [endTime, setEndTime] = useState(task.endTime ? isoToLocalInput(task.endTime) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description,
        tags,
        notes: notes.trim() || null,
        startTime: new Date(startTime).toISOString(),
        endTime: endTime ? new Date(endTime).toISOString() : null,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Error al guardar')
      return
    }
    const data = await res.json()
    const unique = Array.from(new Set<string>(data.deletedDescriptions ?? []))
    for (const desc of unique) {
      toast.info(`«${desc}» fue eliminada al quedar completamente cubierta`)
    }
    // Propagate notes to sibling spans so they stay in sync
    const noteVal = notes.trim() || null
    if (siblingIds && siblingIds.length > 0) {
      await Promise.all(
        siblingIds.map((id) =>
          fetch(`/api/tasks/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: noteVal }),
          })
        )
      )
    }
    onDone()
    router.refresh()
  }

  return (
    <form onSubmit={save} className="rounded-lg border border-primary/40 bg-card p-3 space-y-2 mt-1">
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        required
        aria-label="Descripción"
        className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <input
        type="text"
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
        placeholder="Etiquetas (separadas por coma)"
        aria-label="Etiquetas"
        className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notas (opcional)"
        aria-label="Notas"
        rows={2}
        className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Inicio</label>
          <DateTimeInput value={startTime} onChange={setStartTime} required />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Fin</label>
          <DateTimeInput value={endTime} onChange={setEndTime} />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded border border-border px-3 py-1 text-xs hover:bg-accent"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ─── add span form ────────────────────────────────────────────────────────────

function AddSpanForm({
  entryId,
  description,
  tags,
  notes,
  onDone,
}: {
  entryId: string
  description: string
  tags: string[]
  notes: string | null
  onDone: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!startTime || !endTime) return
    setSaving(true)
    setError('')
    const res = await fetch(`/api/entries/${entryId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description,
        tags,
        notes,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error ?? 'Error al guardar')
      return
    }
    const unique = Array.from(new Set<string>(data.deletedDescriptions ?? []))
    for (const desc of unique) {
      toast.info(`«${desc}» fue eliminada al quedar completamente cubierta`)
    }
    onDone()
    router.refresh()
  }

  return (
    <form onSubmit={save} className="rounded-lg border border-primary/40 bg-card p-3 space-y-2 mt-1">
      <p className="text-xs text-muted-foreground">Nueva sesión para <span className="font-medium text-foreground">{description}</span></p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Inicio</label>
          <DateTimeInput value={startTime} onChange={setStartTime} required />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Fin</label>
          <DateTimeInput value={endTime} onChange={setEndTime} required />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Añadir sesión'}
        </button>
        <button type="button" onClick={onDone} className="rounded border border-border px-3 py-1 text-xs hover:bg-accent">
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function totalMs(tasks: TaskWithTags[]): number {
  return tasks.reduce((sum, t) => {
    if (!t.endTime) return sum
    return sum + new Date(t.endTime).getTime() - new Date(t.startTime).getTime()
  }, 0)
}

// ─── grouped row ─────────────────────────────────────────────────────────────

function TaskGroup({
  description,
  segments,
  entryId,
  activeTaskId,
  allowResume = true,
  isBilled,
  onToggleBilled,
}: {
  description: string
  segments: TaskWithTags[]
  entryId: string
  activeTaskId?: string
  allowResume?: boolean
  isBilled?: boolean
  onToggleBilled?: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [expanded, setExpanded] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState(() => segments.find((s) => s.notes)?.notes ?? '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [addingSpan, setAddingSpan] = useState(false)

  const allTags = Array.from(new Set(segments.flatMap((t) => t.tags)))
  const total = totalMs(segments)
  const spans = segments.length
  const isActive = segments.some((s) => s.id === activeTaskId)

  const groupNotes = segments.find((s) => s.notes)?.notes ?? null

  async function saveGroupNotes() {
    setSavingNotes(true)
    const note = notesValue.trim() || null
    await Promise.all(
      segments.map((s) =>
        fetch(`/api/tasks/${s.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: note }),
        })
      )
    )
    setSavingNotes(false)
    setEditingNotes(false)
    router.refresh()
  }

  async function deleteSegment(id: string) {
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Error al eliminar la tarea'); return }
    router.refresh()
  }

  async function deleteAll() {
    const results = await Promise.all(segments.map((t) => fetch(`/api/tasks/${t.id}`, { method: 'DELETE' })))
    if (results.some((r) => !r.ok)) toast.error('Error al eliminar algunas tareas')
    router.refresh()
  }

  async function resume(e: React.MouseEvent) {
    e.stopPropagation()
    if (activeTaskId) {
      await fetch(`/api/tasks/${activeTaskId}/stop`, { method: 'POST' })
    }
    await fetch(`/api/entries/${entryId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description,
        tags: allTags,
        notes: groupNotes,
        startTime: new Date().toISOString(),
      }),
    })
    router.refresh()
  }

  return (
    <div className={`rounded-lg border border-border bg-card overflow-hidden${isBilled ? ' opacity-60' : ''}`}>
      {/* summary row — entire row is clickable to expand */}
      <div
        role={spans > 1 ? 'button' : undefined}
        tabIndex={spans > 1 ? 0 : undefined}
        onKeyDown={spans > 1 ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v) } } : undefined}
        className="flex items-center justify-between px-3 py-2.5 gap-3 cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => { if (spans > 1) setExpanded((v) => !v) }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {onToggleBilled !== undefined && (
            <input
              type="checkbox"
              checked={!!isBilled}
              onChange={(e) => { e.stopPropagation(); onToggleBilled() }}
              onClick={(e) => e.stopPropagation()}
              title="Marcar como imputada"
              className="h-3 w-3 rounded border-muted-foreground/40 accent-primary shrink-0 cursor-pointer"
            />
          )}
          <div className="min-w-0">
            <p className={`text-sm font-medium truncate${isBilled ? ' line-through' : ''}`} title={description}>{description}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {allTags.map((tag) => (
                <span key={tag} className="text-xs bg-secondary rounded px-1.5 py-0.5">{tag}</span>
              ))}
              <span className="text-xs font-semibold text-foreground tabular-nums">
                {formatMinutes(total / 60000)}
              </span>
              {spans > 1 && (
                <span className="text-xs text-muted-foreground">
                  {spans} sesiones
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isActive && (
            <span className="text-xs text-green-500 font-medium px-1">en curso</span>
          )}
          {!isActive && allowResume && (
            <button
              onClick={resume}
              className="text-muted-foreground hover:text-primary transition-colors p-0.5"
              title="Reanudar tarea"
            >
              <Play width={16} height={16} />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setAddingSpan((v) => !v) }}
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
            title="Añadir sesión"
          >
            <PlusBox width={16} height={16} />
          </button>
          {!groupNotes && !editingNotes && (
            <button
              onClick={(e) => { e.stopPropagation(); setNotesValue(''); setEditingNotes(true) }}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
              title="Añadir notas"
            >
              <Note width={16} height={16} />
            </button>
          )}
          {spans === 1 && !isActive && (
            <button
              onClick={(e) => { e.stopPropagation(); setEditingId(segments[0].id) }}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
              title="Editar"
            >
              <PenSquare width={16} height={16} />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); deleteAll() }}
            className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
            title="Eliminar"
          >
            <TrashIcon size={16} />
          </button>
        </div>
      </div>

      {/* add span form */}
      {addingSpan && (
        <div className="px-3 pb-3">
          <AddSpanForm
            entryId={entryId}
            description={description}
            tags={allTags}
            notes={groupNotes}
            onDone={() => setAddingSpan(false)}
          />
        </div>
      )}

      {/* inline edit for single-segment tasks */}
      {editingId && segments[0].id === editingId && (
        <div className="px-3 pb-3">
          <EditTaskForm task={segments[0]} onDone={() => setEditingId(null)} siblingIds={segments.filter((s) => s.id !== segments[0].id).map((s) => s.id)} />
        </div>
      )}

      {/* group-level notes */}
      {!editingNotes && groupNotes && (
        <div
          className="px-4 pb-2 cursor-pointer"
          onClick={() => { setNotesValue(groupNotes); setEditingNotes(true) }}
        >
          <p className="text-xs text-muted-foreground italic whitespace-pre-wrap">{groupNotes}</p>
        </div>
      )}
      {editingNotes && (
        <div className="px-3 pb-3 space-y-1.5">
          <textarea
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Notas…"
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          <div className="flex gap-1.5">
            <button
              onClick={saveGroupNotes}
              disabled={savingNotes}
              className="rounded bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {savingNotes ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              onClick={() => setEditingNotes(false)}
              className="rounded border border-border px-2 py-1 text-[10px] hover:bg-accent"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* expanded sessions list */}
      {expanded && (
        <div className="border-t border-border/50 divide-y divide-border/30">
          {segments.map((seg) => (
            <div key={seg.id}>
              {editingId === seg.id ? (
                <div className="px-3 py-2">
                  <EditTaskForm task={seg} onDone={() => setEditingId(null)} siblingIds={segments.filter((s) => s.id !== seg.id).map((s) => s.id)} />
                </div>
              ) : (
                <div className="flex items-center justify-between px-4 py-1.5">
                  <span className="text-xs font-mono text-muted-foreground">
                    {fmtTime(seg.startTime)} → {seg.endTime ? fmtTime(seg.endTime) : '…'}
                    <span className="ml-2 text-foreground/70">
                      {seg.endTime
                        ? formatMinutes(
                            (new Date(seg.endTime).getTime() - new Date(seg.startTime).getTime()) / 60000
                          )
                        : seg.id === activeTaskId
                          ? <span className="text-green-500">en curso</span>
                          : '—'}
                    </span>
                  </span>
                  <div className="flex gap-1">
                    {seg.id !== activeTaskId && (
                      <button
                        onClick={() => setEditingId(seg.id)}
                        className="text-muted-foreground hover:text-foreground p-0.5"
                      >
                        <PenSquare width={14} height={14} />
                      </button>
                    )}
                    <button
                      onClick={() => deleteSegment(seg.id)}
                      className="text-muted-foreground hover:text-destructive p-0.5"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── main export ─────────────────────────────────────────────────────────────

export function TaskList({
  tasks,
  entryId,
  activeTaskId,
  allowResume = true,
  showBilledCheckbox,
  entryDate,
}: {
  tasks: TaskWithTags[]
  entryId: string
  activeTaskId?: string
  allowResume?: boolean
  showBilledCheckbox?: boolean
  entryDate?: string
}) {
  const [billed, setBilled] = useState<BilledMap>(new Map())
  useEffect(() => {
    if (showBilledCheckbox) setBilled(loadBilled())
  }, [showBilledCheckbox])

  function toggleBilled(desc: string, segments: TaskWithTags[]) {
    if (!entryDate) return
    const key = billedKey(entryDate, desc)
    const sig = groupSignature(segments)
    const next = new Map(billed)
    if (next.get(key) === sig) {
      next.delete(key)
    } else {
      next.set(key, sig)
    }
    setBilled(next)
    saveBilled(next)
  }

  if (tasks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Sin tareas. Pulsa <kbd className="font-mono bg-muted px-1 rounded">N</kbd> para añadir una.
      </p>
    )
  }

  // group by description, preserving first-seen order
  const order: string[] = []
  const groups = new Map<string, TaskWithTags[]>()
  for (const t of tasks) {
    if (!groups.has(t.description)) {
      groups.set(t.description, [])
      order.push(t.description)
    }
    groups.get(t.description)!.push(t)
  }

  return (
    <div className="space-y-1.5">
      {order.map((desc) => {
        const segs = groups.get(desc)!
        const isBilled = entryDate ? billed.get(billedKey(entryDate, desc)) === groupSignature(segs) : false
        return (
          <TaskGroup
            key={desc}
            description={desc}
            segments={segs}
            entryId={entryId}
            activeTaskId={activeTaskId}
            allowResume={allowResume}
            isBilled={showBilledCheckbox ? isBilled : undefined}
            onToggleBilled={showBilledCheckbox ? () => toggleBilled(desc, segs) : undefined}
          />
        )
      })}
    </div>
  )
}
