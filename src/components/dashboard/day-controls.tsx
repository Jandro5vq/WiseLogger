'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { isoToLocalInput } from '@/lib/utils'
import { DateTimeInput } from '@/components/ui/date-time-input'

interface DayControlsProps {
  entryId: string
  entryStartTime: string
  expectedEndTime: string        // precomputed ISO string for "fin de jornada"
  isClosed: boolean
  activeTaskId?: string
}

function fmtHHMM(isoOrLocal: string): string {
  const d = new Date(isoOrLocal)
  if (isNaN(d.getTime())) return '--:--'
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export function DayControls({
  entryId,
  entryStartTime,
  expectedEndTime,
  isClosed,
  activeTaskId,
}: DayControlsProps) {
  const router = useRouter()
  const [editingStart, setEditingStart] = useState(false)
  const [startInput, setStartInput] = useState('')
  const [savingStart, setSavingStart] = useState(false)

  const [closingDay, setClosingDay] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  function openStartEdit() {
    setStartInput(isoToLocalInput(entryStartTime))
    setEditingStart(true)
  }

  async function saveStartTime(e: React.FormEvent) {
    e.preventDefault()
    if (!startInput) return
    setSavingStart(true)
    await fetch(`/api/entries/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startTime: new Date(startInput).toISOString() }),
    })
    setSavingStart(false)
    setEditingStart(false)
    router.refresh()
  }

  async function handleCloseDay() {
    setClosingDay(true)

    // Stop active task first, setting its endTime to the expected end time
    if (activeTaskId) {
      await fetch(`/api/tasks/${activeTaskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endTime: expectedEndTime }),
      })
    }

    // Close the day
    await fetch('/api/entries/today/close', { method: 'POST' })

    setClosingDay(false)
    setConfirmClose(false)
    router.refresh()
  }

  if (isClosed) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <span className="text-xs">Inicio</span>
        <span className="font-mono font-medium text-foreground">{fmtHHMM(entryStartTime)}</span>
        <span className="flex-1" />
        <span className="text-xs bg-muted rounded px-2 py-0.5">Jornada cerrada</span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* start time row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-xs text-muted-foreground">Inicio</span>

        {editingStart ? (
          <form onSubmit={saveStartTime} className="flex items-center gap-2 flex-1">
            <DateTimeInput value={startInput} onChange={setStartInput} />
            <button
              type="submit"
              disabled={savingStart}
              className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {savingStart ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={() => setEditingStart(false)}
              className="rounded border border-border px-3 py-1 text-xs hover:bg-accent"
            >
              Cancelar
            </button>
          </form>
        ) : (
          <>
            <button
              onClick={openStartEdit}
              className="font-mono font-medium tabular-nums hover:text-primary transition-colors"
              title="Editar hora de inicio"
            >
              {fmtHHMM(entryStartTime)}
            </button>
            <button
              onClick={openStartEdit}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              title="Editar hora de inicio"
            >
              ✎
            </button>
          </>
        )}

        <span className="flex-1" />

        {/* close day button */}
        {!editingStart && (
          confirmClose ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">¿Cerrar jornada?</span>
              <button
                onClick={handleCloseDay}
                disabled={closingDay}
                className="rounded bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {closingDay ? 'Cerrando…' : 'Confirmar'}
              </button>
              <button
                onClick={() => setConfirmClose(false)}
                className="rounded border border-border px-3 py-1 text-xs hover:bg-accent"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClose(true)}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Fin de día
            </button>
          )
        )}
      </div>
    </div>
  )
}
