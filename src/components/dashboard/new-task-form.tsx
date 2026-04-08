'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isoToLocalInput } from '@/lib/utils'

interface Favorite {
  description: string
  tags: string[]
  uses: number
}

interface NewTaskFormProps {
  entryId: string
  activeTaskId?: string // if set, it will be stopped first
}

export function NewTaskForm({ entryId, activeTaskId }: NewTaskFormProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [showFavorites, setShowFavorites] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/tasks/favorites')
      .then((r) => r.json())
      .then(setFavorites)
      .catch(() => {})
  }, [])

  useEffect(() => {
    function handleOpen() { setOpen(true) }
    window.addEventListener('wl:new-task', handleOpen)
    return () => window.removeEventListener('wl:new-task', handleOpen)
  }, [])

  function openForm() {
    setStartTime(isoToLocalInput(new Date().toISOString()))
    setOpen(true)
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

    // Stop currently active task first (pause it)
    if (activeTaskId) {
      await fetch(`/api/tasks/${activeTaskId}/stop`, { method: 'POST' })
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

    setDescription('')
    setTagsInput('')
    setStartTime('')
    setEndTime('')
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={openForm}
        className="w-full rounded-lg border-2 border-dashed border-border hover:border-primary/50 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        + New task <span className="text-xs opacity-60">(N)</span>
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="relative">
        <input
          type="text"
          placeholder="Task description"
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
        placeholder="Tags (comma-separated)"
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Start time</label>
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">End time <span className="opacity-50">(optional)</span></label>
          <input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {activeTaskId && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          The active task will be stopped when you start this one.
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Saving…' : endTime ? 'Add task' : 'Start task'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError('') }}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
