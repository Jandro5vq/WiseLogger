'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import createDOMPurify from 'dompurify'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Note } from 'pixelarticons/react'

// dompurify v3's default export is a factory — it has no `.sanitize` until
// invoked with a window. Cache a browser-bound instance on first use.
let purifier: { sanitize: (html: string) => string } | null = null
function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') return ''
  if (!purifier) purifier = createDOMPurify(window) as { sanitize: (h: string) => string }
  return purifier.sanitize(html)
}

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
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!html) return <p className="text-xs text-muted-foreground italic">Sin notas</p>
  if (!mounted) return <div className="h-4" aria-hidden />
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none text-xs text-muted-foreground"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  )
}

/** Idle time after the last keystroke before the notes are saved. */
const AUTOSAVE_MS = 1500

export function DailyNotes({ entryId, initialNotes, recentEntries }: DailyNotesProps) {
  const [status, setStatus] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  // Last HTML the server has; lets us skip no-op saves and know what's still pending.
  const lastSavedRef = useRef(initialNotes || '')
  const pendingRef = useRef<string | null>(null)

  const save = useCallback(
    async (html: string) => {
      clearTimeout(debounceRef.current)
      if (html === lastSavedRef.current) { pendingRef.current = null; return }
      setStatus('saving')
      try {
        const res = await fetch(`/api/entries/${entryId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: html }),
        })
        if (!res.ok) throw new Error()
      } catch {
        setStatus('error')
        return
      }
      lastSavedRef.current = html
      // Newer keystrokes may have arrived while this request was in flight.
      if (pendingRef.current === html) pendingRef.current = null
      setStatus(pendingRef.current === null ? 'saved' : 'dirty')
      clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 2000)
    },
    [entryId]
  )

  // Leaving the page (tab close, navigation, backgrounding) flushes pending notes with a
  // keepalive request, which the browser completes even after the page is gone.
  useEffect(() => {
    function flush() {
      const html = pendingRef.current
      if (html === null || html === lastSavedRef.current) return
      clearTimeout(debounceRef.current)
      fetch(`/api/entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: html }),
        keepalive: true,
      }).catch(() => {})
      lastSavedRef.current = html
      pendingRef.current = null
    }
    function onVisibility() { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      flush()
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimeout(savedTimerRef.current)
      clearTimeout(debounceRef.current)
    }
  }, [entryId])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Notas del día…' }),
    ],
    content: initialNotes || '',
    onUpdate({ editor }) {
      const html = editor.getHTML()
      pendingRef.current = html
      setStatus('dirty')
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => save(html), AUTOSAVE_MS)
    },
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
    <div data-tour="daily-notes" className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <h2 className="text-sm font-medium flex items-center gap-1.5"><Note width={16} height={16} />Notas</h2>
        <span aria-live="polite" className="text-xs">
          {status === 'dirty' && <span className="text-muted-foreground">Sin guardar…</span>}
          {status === 'saving' && <span className="text-muted-foreground">Guardando…</span>}
          {status === 'saved' && <span className="text-green-600 dark:text-green-400">Guardado</span>}
          {status === 'error' && (
            <button
              onClick={() => editor && save(editor.getHTML())}
              className="text-destructive underline-offset-2 hover:underline"
            >
              Error al guardar · Reintentar
            </button>
          )}
        </span>
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
