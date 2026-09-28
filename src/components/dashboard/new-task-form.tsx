'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isoToLocalInput } from '@/lib/utils'
import { DateTimeInput } from '@/components/ui/date-time-input'
import { useToast } from '@/components/ui/toast'
import { incompleteTimeError } from '@/lib/time-mask'
import { Play } from 'pixelarticons/react'

interface Favorite {
  description: string
  tags: string[]
  uses: number
}

/** How many quick-start chips to show — also the range of the 1–N shortcuts. */
const QUICK_CHIPS = 6

interface NewTaskFormProps {
  entryId: string
  /** Calendar day (YYYY-MM-DD) this entry belongs to — always today on the dashboard. */
  entryDate: string
  activeTaskId?: string // if set, the server closes/splits it to make room
  /** Description of the active task — hides its quick-start chip while it runs */
  activeTaskDescription?: string
  /** ISO string — if provided, the new-task form opens with this as the default start time */
  defaultStartTime?: string
}

function parseTags(input: string): string[] {
  return input.split(',').map((t) => t.trim()).filter(Boolean)
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
  const [highlighted, setHighlighted] = useState(-1)
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

  const quickChips = favorites
    .filter((f) => f.description !== activeTaskDescription)
    .slice(0, QUICK_CHIPS)

  // Suggestions narrow down as the user types; an exact match is hidden (nothing left to pick).
  const query = description.trim().toLowerCase()
  const suggestions = favorites.filter((f) => {
    const d = f.description.toLowerCase()
    return d.includes(query) && d !== query
  })

  // Tags already used on recent tasks that aren't in the input yet.
  const currentTags = new Set(parseTags(tagsInput).map((t) => t.toLowerCase()))
  const tagSuggestions = Array.from(new Set(favorites.flatMap((f) => f.tags)))
    .filter((t) => !currentTags.has(t.toLowerCase()))
    .slice(0, 8)

  function openForm() {
    loadFavorites()
    setStartTime(isoToLocalInput(defaultStartTime ?? new Date().toISOString()))
    // Always start blank — a leftover endTime from a previous open+cancel would
    // otherwise silently carry over and make the task look "completed" by default.
    setEndTime('')
    setError('')
    setOpen(true)
  }

  // One-tap start: the server closes the active task (if any) at now and starts the favorite.
  async function quickStart(fav: Favorite) {
    setQuickStarting(fav.description)
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

  // Window listeners (N, "Cambiar a…", 1–6) must see the latest props/state without
  // re-subscribing on every render.
  const openFormRef = useRef(openForm)
  const quickStartRef = useRef(quickStart)
  const stateRef = useRef({ open, quickChips, quickStarting })
  openFormRef.current = openForm
  quickStartRef.current = quickStart
  stateRef.current = { open, quickChips, quickStarting }

  useEffect(() => {
    function handleOpen() { openFormRef.current() }
    function handleQuickStart(e: Event) {
      const { open, quickChips, quickStarting } = stateRef.current
      if (open || quickStarting) return
      const fav = quickChips[(e as CustomEvent<number>).detail]
      if (fav) quickStartRef.current(fav)
    }
    window.addEventListener('wl:new-task', handleOpen)
    window.addEventListener('wl:quick-start', handleQuickStart)
    return () => {
      window.removeEventListener('wl:new-task', handleOpen)
      window.removeEventListener('wl:quick-start', handleQuickStart)
    }
  }, [])

  function applyFavorite(fav: Favorite) {
    setDescription(fav.description)
    setTagsInput(fav.tags.join(', '))
    setShowFavorites(false)
    setHighlighted(-1)
  }

  function addTag(tag: string) {
    setTagsInput([...parseTags(tagsInput), tag].join(', '))
  }

  function onDescriptionKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const visible = showFavorites && suggestions.length > 0
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setShowFavorites(true)
      setHighlighted((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp' && visible) {
      e.preventDefault()
      setHighlighted((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && visible && highlighted >= 0) {
      e.preventDefault()
      applyFavorite(suggestions[highlighted])
    } else if (e.key === 'Escape') {
      if (visible) setShowFavorites(false)
      else { setOpen(false); setError('') }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) return
    const timeError = incompleteTimeError(startTime, endTime)
    if (timeError) { setError(timeError); return }
    setError('')
    setLoading(true)

    // No separate stop call: the server closes, splits or replaces the active task
    // itself so the new task always fits (and fails atomically if it can't).

    const body: Record<string, unknown> = { description: description.trim(), tags: parseTags(tagsInput) }
    if (startTime) body.startTime = new Date(startTime).toISOString()
    if (endTime) body.endTime = new Date(endTime).toISOString()

    const res = await fetch(`/api/entries/${entryId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json().catch(() => ({}))
    setLoading(false)

    if (!res.ok) {
      setError(data.error || 'No se pudo añadir la tarea')
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
            {quickChips.map((fav, i) => (
              <button
                key={fav.description}
                onClick={() => quickStart(fav)}
                disabled={!!quickStarting}
                title={`Iniciar «${fav.description}» ahora (${i + 1})`}
                className="flex items-center gap-1 max-w-full rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
              >
                <Play width={12} height={12} className="shrink-0" />
                <span className="truncate">
                  {quickStarting === fav.description ? 'Iniciando…' : fav.description}
                </span>
                <kbd className="ml-0.5 font-mono text-[10px] opacity-50">{i + 1}</kbd>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  const listVisible = showFavorites && suggestions.length > 0

  return (
    <form data-tour="new-task" onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="relative">
        <input
          type="text"
          placeholder="Descripción de la tarea"
          aria-label="Descripción de la tarea"
          role="combobox"
          aria-expanded={listVisible}
          aria-controls="new-task-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={listVisible && highlighted >= 0 ? `new-task-suggestion-${highlighted}` : undefined}
          autoComplete="off"
          required
          autoFocus
          value={description}
          onChange={(e) => { setDescription(e.target.value); setShowFavorites(true); setHighlighted(-1) }}
          onKeyDown={onDescriptionKeyDown}
          onFocus={() => setShowFavorites(true)}
          onBlur={() => setTimeout(() => setShowFavorites(false), 150)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {listVisible && (
          <div
            id="new-task-suggestions"
            role="listbox"
            className="absolute top-full left-0 right-0 z-10 mt-1 rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-auto"
          >
            {suggestions.map((fav, i) => (
              <button
                key={fav.description}
                id={`new-task-suggestion-${i}`}
                role="option"
                aria-selected={i === highlighted}
                type="button"
                tabIndex={-1}
                onMouseDown={() => applyFavorite(fav)}
                onMouseEnter={() => setHighlighted(i)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors ${i === highlighted ? 'bg-accent' : 'hover:bg-accent'}`}
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

      <div className="space-y-1.5">
        <input
          type="text"
          placeholder="Etiquetas (separadas por coma)"
          aria-label="Etiquetas"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {tagSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tagSuggestions.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => addTag(tag)}
                title={`Añadir etiqueta «${tag}»`}
                className="rounded bg-secondary/60 px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                + {tag}
              </button>
            ))}
          </div>
        )}
      </div>

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
          La tarea activa se detendrá o se recortará para dejar sitio a esta.
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
