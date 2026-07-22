'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isoToLocalInput } from '@/lib/utils'
import { DateTimeInput } from '@/components/ui/date-time-input'
import { useToast } from '@/components/ui/toast'
import { Play } from 'pixelarticons/react'

interface Favorite {
  description: string
  tags: string[]
  uses: number
}

interface NewTaskFormProps {
  entryId: string
  /** Calendar day (YYYY-MM-DD) this entry belongs to — always today on the dashboard. */
  entryDate: string
  activeTaskId?: string // if set, it will be stopped first
  /** Description of the active task — hides its quick-start chip while it runs */
  activeTaskDescription?: string
  /** ISO string — if provided, the new-task form opens with this as the default start time */
  defaultStartTime?: string
}

export function NewTaskForm({ entryId, entryDate, activeTaskId, activeTaskDescription, defaultStartTime }: NewTaskFormProps) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [showFavorites, setShowFavorites] = useState(false)
  const [loading, setLoading] = useState(false)
  const [quickStarting, setQuickStarting] = useState('')
  const [error, setError] = useState('')

  // Recent task names, newest first (the API orders by max(startTime) desc).
  // Refetched every time the form opens so the list never goes stale.
  const loadFavorites = useCallback(() => {
    fetch('/api/tasks/favorites')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setFavorites(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  useEffect(() => { loadFavorites() }, [loadFavorites])

  useEffect(() => {
    function handleOpen() {
      loadFavorites()
      setOpen(true)
    }
    window.addEventListener('wl:new-task', handleOpen)
    return () => window.removeEventListener('wl:new-task', handleOpen)
  }, [loadFavorites])

  function openForm() {
    loadFavorites()
    setStartTime(isoToLocalInput(defaultStartTime ?? new Date().toISOString()))
    // Always start blank — a leftover endTime from a previous open+cancel would
    // otherwise silently carry over and make the task look "completed" by default.
    setEndTime('')
    setOpen(true)
  }

  // One-tap start: stop the active task (if any) at now and start the favorite,
  // same sequence as the resume action in the task list.
  async function quickStart(fav: Favorite) {
    setQuickStarting(fav.description)
    if (activeTaskId) {
      await fetch(`/api/tasks/${activeTaskId}/stop`, { method: 'POST' })
    }
    const res = await fetch(`/api/entries/${entryId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: fav.description, tags: fav.tags }),
    })
    setQuickStarting('')
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error || 'No se pudo iniciar la tarea')
      return
    }
    router.refresh()
  }

  function applyFavorite(fav: Favorite) {
    setDescription(fav.description)
    setTagsInput(fav.tags.join(', '))
    setShowFavorites(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) return
    setError('')
    setLoading(true)

    // Stop currently active task first, ending it at the new task's start time
    if (activeTaskId) {
      const stopBody = startTime ? { endTime: new Date(startTime).toISOString() } : undefined
      await fetch(`/api/tasks/${activeTaskId}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: stopBody ? JSON.stringify(stopBody) : undefined,
      })
    }

    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
    const body: Record<string, unknown> = { description: description.trim(), tags }
    if (startTime) body.startTime = new Date(startTime).toISOString()
    if (endTime) body.endTime = new Date(endTime).toISOString()

    const res = await fetch(`/api/entries/${entryId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error || 'Failed to add task')
      return
    }

    const deleted: string[] = data.deletedDescriptions ?? []
    const unique = Array.from(new Set(deleted))
    for (const desc of unique) {
      toast.info(`«${desc}» fue eliminada al quedar completamente cubierta`)
    }

    setDescription('')
    setTagsInput('')
    setStartTime('')
    setEndTime('')
    setOpen(false)
    loadFavorites()
    router.refresh()
  }

  if (!open) {
    const quickChips = favorites
      .filter((f) => f.description !== activeTaskDescription)
      .slice(0, 2)
    return (
      <div className="space-y-2">
        <button
          data-tour="new-task"
          onClick={openForm}
          className="w-full rounded-lg border-2 border-dashed border-border hover:border-primary/50 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          + Nueva tarea <span className="text-xs opacity-60">(N)</span>
        </button>
        {quickChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {quickChips.map((fav) => (
              <button
                key={fav.description}
                onClick={() => quickStart(fav)}
                disabled={!!quickStarting}
                title={`Iniciar «${fav.description}» ahora`}
                className="flex items-center gap-1 max-w-full rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
              >
                <Play width={12} height={12} className="shrink-0" />
                <span className="truncate">
                  {quickStarting === fav.description ? 'Iniciando…' : fav.description}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <form data-tour="new-task" onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="relative">
        <input
          type="text"
          placeholder="Descripción de la tarea"
          aria-label="Descripción de la tarea"
          required
          autoFocus
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onFocus={() => setShowFavorites(true)}
          onBlur={() => setTimeout(() => setShowFavorites(false), 150)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {showFavorites && favorites.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-auto">
            {favorites.map((fav) => (
              <button
                key={fav.description}
                type="button"
                onMouseDown={() => applyFavorite(fav)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <span className="font-medium">{fav.description}</span>
                {fav.tags.length > 0 && (
                  <span className="text-xs text-muted-foreground ml-2">{fav.tags.join(', ')}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <input
        type="text"
        placeholder="Etiquetas (separadas por coma)"
        aria-label="Etiquetas"
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Hora de inicio</label>
          <DateTimeInput value={startTime} onChange={setStartTime} contextDate={entryDate} />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Hora de fin <span className="opacity-50">(opcional)</span></label>
          <DateTimeInput value={endTime} onChange={setEndTime} contextDate={entryDate} />
        </div>
      </div>

      {activeTaskId && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          La tarea activa se detendrá al iniciar esta.
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Guardando…' : endTime ? 'Añadir tarea' : 'Iniciar tarea'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError('') }}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
