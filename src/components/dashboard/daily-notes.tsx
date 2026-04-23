'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import DOMPurify from 'dompurify'
import { useEffect, useRef, useState, useCallback } from 'react'

interface RecentEntry {
  date: string
  notes: string
}

interface DailyNotesProps {
  entryId: string
  initialNotes: string
  recentEntries: RecentEntry[]
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

function NotesViewer({ html }: { html: string }) {
  if (!html) return <p className="text-xs text-muted-foreground italic">Sin notas</p>
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none text-xs text-muted-foreground"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
    />
  )
}

export function DailyNotes({ entryId, initialNotes, recentEntries }: DailyNotesProps) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => { clearTimeout(savedTimerRef.current) }, [])

  const save = useCallback(
    async (html: string) => {
      setSaving(true)
      await fetch(`/api/entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: html }),
      })
      setSaving(false)
      setSaved(true)
      clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000)
    },
    [entryId]
  )

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Notas del día…' }),
    ],
    content: initialNotes || '',
    onBlur({ editor }) {
      save(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class:
          'min-h-[80px] px-3 py-2 text-sm focus:outline-none prose prose-sm dark:prose-invert max-w-none',
      },
    },
  })

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <h2 className="text-sm font-medium">Notas</h2>
        {saving && <span className="text-xs text-muted-foreground">Guardando…</span>}
        {!saving && saved && <span className="text-xs text-green-600 dark:text-green-400">Guardado</span>}
      </div>

      {/* editor */}
      <div className="border-b border-border/60">
        <EditorContent editor={editor} />
      </div>

      {/* recent entries */}
      {recentEntries.length > 0 && (
        <div className="divide-y divide-border/40">
          {recentEntries.map((e) => (
            <details key={e.date} className="group">
              <summary className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-accent/40 transition-colors list-none">
                <span className="text-xs font-medium capitalize text-muted-foreground">{fmtDate(e.date)}</span>
                <span className="text-xs text-muted-foreground/50 group-open:rotate-90 transition-transform">›</span>
              </summary>
              <div className="px-4 pb-3 pt-1">
                <NotesViewer html={e.notes} />
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  )
}
