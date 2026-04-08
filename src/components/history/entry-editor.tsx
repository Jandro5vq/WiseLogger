'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatMinutes, isoToLocalInput } from '@/lib/utils'
import type { Entry, TaskWithTags } from '@/types/db'
import { TaskList } from '@/components/dashboard/task-list'

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
        placeholder="Task description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        required
        autoFocus
        className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <input
        type="text"
        placeholder="Tags (comma-separated)"
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
        className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Start</label>
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">End <span className="opacity-50">(optional)</span></label>
          <input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? 'Adding…' : 'Add task'}
      </button>
    </form>
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
        No shift recorded for this day.
      </div>
    )
  }

  const completedTasks = tasks.filter((t) => t.endTime)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Worked</p>
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
          <h2 className="text-sm font-medium">Tasks</h2>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdd ? 'Cancel' : '+ Add task'}
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
        <h2 className="text-sm font-medium mb-2">Notes</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          placeholder="Add notes for this day…"
        />
        <button
          onClick={saveNotes}
          disabled={saving}
          className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save notes'}
        </button>
      </div>
    </div>
  )
}
