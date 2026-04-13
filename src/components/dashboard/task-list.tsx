'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { formatMinutes, isoToLocalInput } from '@/lib/utils'
import type { TaskWithTags } from '@/types/db'
import { DateTimeInput } from '@/components/ui/date-time-input'
import { Play, PenSquare, Cancel } from 'pixelarticons/react'

// ─── edit form for a single segment ──────────────────────────────────────────

function EditTaskForm({ task, onDone }: { task: TaskWithTags; onDone: () => void }) {
  const router = useRouter()
  const [description, setDescription] = useState(task.description)
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
        className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <input
        type="text"
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
        placeholder="Etiquetas (separadas por coma)"
        className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="grid grid-cols-2 gap-2">
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
}: {
  description: string
  segments: TaskWithTags[]
  entryId: string
  activeTaskId?: string
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const allTags = Array.from(new Set(segments.flatMap((t) => t.tags)))
  const total = totalMs(segments)
  const spans = segments.length
  const isActive = segments.some((s) => s.id === activeTaskId)

  async function deleteSegment(id: string) {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  async function deleteAll() {
    await Promise.all(segments.map((t) => fetch(`/api/tasks/${t.id}`, { method: 'DELETE' })))
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
        startTime: new Date().toISOString(),
      }),
    })
    router.refresh()
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* summary row — entire row is clickable to expand */}
      <div
        className="flex items-center justify-between px-3 py-2.5 gap-3 cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => { if (spans > 1) setExpanded((v) => !v) }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" title={description}>{description}</p>
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

        <div className="flex items-center gap-1 shrink-0">
          {isActive && (
            <span className="text-xs text-green-500 font-medium px-1">en curso</span>
          )}
          {!isActive && (
            <button
              onClick={resume}
              className="text-muted-foreground hover:text-primary transition-colors p-0.5"
              title="Reanudar tarea"
            >
              <Play width={16} height={16} />
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
            <Cancel width={16} height={16} />
          </button>
        </div>
      </div>

      {/* inline edit for single-segment tasks */}
      {editingId && segments[0].id === editingId && (
        <div className="px-3 pb-3">
          <EditTaskForm task={segments[0]} onDone={() => setEditingId(null)} />
        </div>
      )}

      {/* expanded sessions list */}
      {expanded && (
        <div className="border-t border-border/50 divide-y divide-border/30">
          {segments.map((seg) => (
            <div key={seg.id}>
              {editingId === seg.id ? (
                <div className="px-3 py-2">
                  <EditTaskForm task={seg} onDone={() => setEditingId(null)} />
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
                        <PenSquare width={15} height={15} />
                      </button>
                    )}
                    <button
                      onClick={() => deleteSegment(seg.id)}
                      className="text-muted-foreground hover:text-destructive p-0.5"
                    >
                      <Cancel width={15} height={15} />
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
}: {
  tasks: TaskWithTags[]
  entryId: string
  activeTaskId?: string
}) {
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
      {order.map((desc) => (
        <TaskGroup
          key={desc}
          description={desc}
          segments={groups.get(desc)!}
          entryId={entryId}
          activeTaskId={activeTaskId}
        />
      ))}
    </div>
  )
}
