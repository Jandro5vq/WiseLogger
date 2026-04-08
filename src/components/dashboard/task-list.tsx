'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { formatMinutes, isoToLocalInput } from '@/lib/utils'
import type { TaskWithTags } from '@/types/db'

// ─── edit form for a single segment ──────────────────────────────────────────

function EditTaskForm({ task, onDone }: { task: TaskWithTags; onDone: () => void }) {
  const router = useRouter()
  const [description, setDescription] = useState(task.description)
  const [tagsInput, setTagsInput] = useState(task.tags.join(', '))
  const [startTime, setStartTime] = useState(isoToLocalInput(task.startTime))
  const [endTime, setEndTime] = useState(task.endTime ? isoToLocalInput(task.endTime) : '')
  const [saving, setSaving] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
    await fetch(`/api/tasks/${task.id}`, {
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
        placeholder="Tags (comma-separated)"
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
          <label className="text-xs text-muted-foreground">End</label>
          <input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded border border-border px-3 py-1 text-xs hover:bg-accent"
        >
          Cancel
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

  const allTags = [...new Set(segments.flatMap((t) => t.tags))]
  const total = totalMs(segments)
  const spans = segments.length

  async function deleteSegment(id: string) {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  async function deleteAll() {
    await Promise.all(segments.map((t) => fetch(`/api/tasks/${t.id}`, { method: 'DELETE' })))
    router.refresh()
  }

  async function resume() {
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
      {/* summary row */}
      <div className="flex items-center justify-between px-3 py-2.5 gap-3">
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
                {spans} sessions
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={resume}
            className="text-xs text-muted-foreground hover:text-primary transition-colors px-1"
            title="Resume task"
          >
            ▶
          </button>
          {spans > 1 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
              title={expanded ? 'Collapse' : 'Show sessions'}
            >
              {expanded ? '▲' : '▼'}
            </button>
          )}
          {spans === 1 && (
            <button
              onClick={() => setEditingId(segments[0].id)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
              title="Edit"
            >
              ✎
            </button>
          )}
          <button
            onClick={deleteAll}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors px-1"
            title="Delete"
          >
            ✕
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
                        : '—'}
                    </span>
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditingId(seg.id)}
                      className="text-xs text-muted-foreground hover:text-foreground px-1"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => deleteSegment(seg.id)}
                      className="text-xs text-muted-foreground hover:text-destructive px-1"
                    >
                      ✕
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
        No tasks yet. Press <kbd className="font-mono bg-muted px-1 rounded">N</kbd> to add one.
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
