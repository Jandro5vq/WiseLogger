'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatMinutes, isoToLocalInput } from '@/lib/utils'
import type { Entry, TaskWithTags } from '@/types/db'
import { TaskList } from '@/components/dashboard/task-list'
import { DateTimeInput } from '@/components/ui/date-time-input'

function useAdjustPref(key: string): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(true)
  useEffect(() => {
    const stored = localStorage.getItem(key)
    if (stored !== null) setValue(stored === 'true')
  }, [key])
  function set(v: boolean) {
    setValue(v)
    localStorage.setItem(key, String(v))
  }
  return [value, set]
}

interface EntryEditorProps {
  date: string
  entry: Entry | undefined
  tasks: TaskWithTags[]
}

function AddTaskForm({ entryId, onAdded }: { entryId: string; onAdded: () => void }) {
  const now = new Date()
  const [description, setDescription] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [startTime, setStartTime] = useState(isoToLocalInput(now.toISOString()))
  const [endTime, setEndTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) return
    setError('')
    setSaving(true)
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
    const body: Record<string, unknown> = {
      description: description.trim(),
      tags,
      startTime: new Date(startTime).toISOString(),
    }
    if (endTime) body.endTime = new Date(endTime).toISOString()

    const res = await fetch(`/api/entries/${entryId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Failed'); return }
    setDescription('')
    setTagsInput('')
    setEndTime('')
    onAdded()
  }

  return (
    <form onSubmit={save} className="rounded-lg border border-primary/30 bg-card p-3 space-y-2">
      <input
        type="text"
        placeholder="Descripción de la tarea"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        required
        autoFocus
        className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <input
        type="text"
        placeholder="Etiquetas (separadas por coma)"
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
        className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Inicio</label>
          <DateTimeInput value={startTime} onChange={setStartTime} required />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Fin <span className="opacity-50">(opcional)</span></label>
          <DateTimeInput value={endTime} onChange={setEndTime} />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? 'Añadiendo…' : 'Añadir tarea'}
      </button>
    </form>
  )
}

function WorkdayHoursEditor({ entry }: { entry: Entry }) {
  const router = useRouter()
  const [startInput, setStartInput] = useState(isoToLocalInput(entry.startTime ?? ''))
  const [endInput, setEndInput] = useState(isoToLocalInput(entry.endTime ?? ''))
  const [adjustFirst, setAdjustFirst] = useAdjustPref('wl:adjustFirstTask')
  const [adjustLast, setAdjustLast] = useAdjustPref('wl:adjustLastTask')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const body: Record<string, unknown> = {}
    if (startInput) { body.startTime = new Date(startInput).toISOString(); body.adjustFirstTask = adjustFirst }
    if (endInput) { body.endTime = new Date(endInput).toISOString(); body.adjustLastTask = adjustLast }
    const res = await fetch(`/api/entries/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!res.ok) { setError('Error al guardar'); return }
    router.refresh()
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium mb-3">Horario de jornada</h2>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Inicio</label>
            <DateTimeInput value={startInput} onChange={setStartInput} />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer mt-1.5">
              <input
                type="checkbox"
                checked={adjustFirst}
                onChange={(e) => setAdjustFirst(e.target.checked)}
                className="rounded"
              />
              Mover 1ª tarea
            </label>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Fin</label>
            <DateTimeInput value={endInput} onChange={setEndInput} />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer mt-1.5">
              <input
                type="checkbox"
                checked={adjustLast}
                onChange={(e) => setAdjustLast(e.target.checked)}
                className="rounded"
              />
              Mover última tarea
            </label>
          </div>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar horario'}
        </button>
      </form>
    </div>
  )
}

export function EntryEditor({ date, entry, tasks }: EntryEditorProps) {
  const router = useRouter()
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  const workedMinutes = tasks
    .filter((t) => t.endTime)
    .reduce((sum, t) => {
      const ms = new Date(t.endTime!).getTime() - new Date(t.startTime).getTime()
      return sum + ms / 60000
    }, 0)

  const dayBalance = workedMinutes - (entry?.expectedMinutes ?? 0)

  async function saveNotes() {
    if (!entry) return
    setSaving(true)
    await fetch(`/api/entries/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    setSaving(false)
    router.refresh()
  }

  if (!entry) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        Sin jornada registrada para este día.
      </div>
    )
  }

  const completedTasks = tasks.filter((t) => t.endTime)

  return (
    <div className="space-y-4">
      <WorkdayHoursEditor entry={entry} />

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Trabajado</p>
          <p className="text-xl font-bold">{formatMinutes(workedMinutes)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Balance</p>

          <p className={`text-xl font-bold ${dayBalance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {dayBalance >= 0 ? '+' : ''}{formatMinutes(dayBalance)}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-medium">Tareas</h2>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdd ? 'Cancelar' : '+ Añadir tarea'}
          </button>
        </div>
        <div className="p-4 space-y-3">
          {showAdd && (
            <AddTaskForm
              entryId={entry.id}
              onAdded={() => { setShowAdd(false); router.refresh() }}
            />
          )}
          <TaskList tasks={completedTasks} entryId={entry.id} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium mb-2">Notas</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          placeholder="Notas del día…"
        />
        <button
          onClick={saveNotes}
          disabled={saving}
          className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar notas'}
        </button>
      </div>
    </div>
  )
}
