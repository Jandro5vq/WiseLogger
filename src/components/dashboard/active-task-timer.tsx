'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatElapsed, todayISO, isoToLocalInput } from '@/lib/utils'
import { DateTimeInput } from '@/components/ui/date-time-input'
import { MagicEdit } from 'pixelarticons/react'
import type { TaskWithTags } from '@/types/db'

interface ActiveTaskTimerProps {
  task: TaskWithTags
  loadedDate: string
}

export function ActiveTaskTimer({ task, loadedDate }: ActiveTaskTimerProps) {
  const router = useRouter()
  const [elapsedMs, setElapsedMs] = useState(0)
  const [stopping, setStopping] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editDesc, setEditDesc] = useState(task.description)
  const [editTags, setEditTags] = useState(task.tags.join(', '))
  const [editStart, setEditStart] = useState(isoToLocalInput(task.startTime))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    function tick() {
      setElapsedMs(Date.now() - new Date(task.startTime).getTime())
      if (todayISO() !== loadedDate) router.refresh()
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [task.startTime, loadedDate, router])

  useEffect(() => {
    async function handleStop() { await stopTask() }
    window.addEventListener('wl:stop-task', handleStop)
    return () => window.removeEventListener('wl:stop-task', handleStop)
  })

  async function stopTask() {
    setStopping(true)
    await fetch(`/api/tasks/${task.id}/stop`, { method: 'POST' })
    setStopping(false)
    router.refresh()
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const tags = editTags.split(',').map((t) => t.trim()).filter(Boolean)
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: editDesc,
        tags,
        startTime: new Date(editStart).toISOString(),
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Error al guardar')
      return
    }
    setEditing(false)
    router.refresh()
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="animate-pulse w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-sm font-medium">Tarea activa</span>
            <button
              onClick={() => { setEditing((v) => !v); setError('') }}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
              title="Editar tarea activa"
            >
              <MagicEdit width={20} height={20} />
            </button>
          </div>
          <p className="text-base font-semibold mt-1 truncate" title={task.description}>{task.description}</p>
          {task.tags.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {task.tags.map((tag) => (
                <span key={tag} className="text-xs bg-secondary rounded px-1.5 py-0.5">{tag}</span>
              ))}
            </div>
          )}
        </div>
        <div className="text-right shrink-0 ml-4">
          <p className="text-2xl font-mono font-bold tabular-nums">{formatElapsed(elapsedMs)}</p>
          <button
            onClick={stopTask}
            disabled={stopping}
            className="mt-2 rounded bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {stopping ? 'Deteniendo…' : 'Detener (S)'}
          </button>
        </div>
      </div>

      {editing && (
        <form onSubmit={saveEdit} className="mt-3 pt-3 border-t border-primary/20 space-y-2">
          <input
            type="text"
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            required
            placeholder="Descripción"
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="text"
            value={editTags}
            onChange={(e) => setEditTags(e.target.value)}
            placeholder="Etiquetas (separadas por coma)"
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div>
            <label className="text-xs text-muted-foreground">Hora de inicio</label>
            <DateTimeInput value={editStart} onChange={setEditStart} required />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setError('') }}
              className="rounded border border-border px-3 py-1 text-xs hover:bg-accent"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
