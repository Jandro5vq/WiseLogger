'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isoToLocalInput } from '@/lib/utils'
import { DateTimeInput } from '@/components/ui/date-time-input'

interface DayControlsProps {
  entryId: string
  entryStartTime: string
  entryEndTime?: string           // set when the day is closed
  expectedEndTime: string         // precomputed ISO string for "fin de jornada"
  isClosed: boolean
  activeTaskId?: string
}

function fmtHHMM(isoOrLocal: string): string {
  const d = new Date(isoOrLocal)
  if (isNaN(d.getTime())) return '--:--'
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

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

export function DayControls({
  entryId,
  entryStartTime,
  entryEndTime,
  expectedEndTime,
  isClosed,
  activeTaskId,
}: DayControlsProps) {
  const router = useRouter()

  const [editingStart, setEditingStart] = useState(false)
  const [startInput, setStartInput] = useState('')
  const [savingStart, setSavingStart] = useState(false)

  const [editingEnd, setEditingEnd] = useState(false)
  const [endInput, setEndInput] = useState('')
  const [savingEnd, setSavingEnd] = useState(false)

  const [closingDay, setClosingDay] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const [adjustFirst, setAdjustFirst] = useAdjustPref('wl:adjustFirstTask')
  const [adjustLast, setAdjustLast] = useAdjustPref('wl:adjustLastTask')

  function openStartEdit() {
    setStartInput(isoToLocalInput(entryStartTime))
    setEditingStart(true)
  }

  function openEndEdit() {
    setEndInput(isoToLocalInput(entryEndTime ?? expectedEndTime))
    setEditingEnd(true)
  }

  async function saveStartTime(e: React.FormEvent) {
    e.preventDefault()
    if (!startInput) return
    setSavingStart(true)
    await fetch(`/api/entries/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startTime: new Date(startInput).toISOString(),
        adjustFirstTask: adjustFirst,
      }),
    })
    setSavingStart(false)
    setEditingStart(false)
    router.refresh()
  }

  async function saveEndTime(e: React.FormEvent) {
    e.preventDefault()
    if (!endInput) return
    setSavingEnd(true)
    await fetch(`/api/entries/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endTime: new Date(endInput).toISOString(),
        adjustLastTask: adjustLast,
      }),
    })
    setSavingEnd(false)
    setEditingEnd(false)
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
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {/* Start time row */}
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-xs text-muted-foreground w-10">Inicio</span>
          {editingStart ? (
            <form onSubmit={saveStartTime} className="flex flex-wrap items-center gap-2 flex-1">
              <DateTimeInput value={startInput} onChange={setStartInput} />
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={adjustFirst}
                  onChange={(e) => setAdjustFirst(e.target.checked)}
                  className="rounded"
                />
                Mover 1ª tarea
              </label>
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
              <span className="flex-1" />
              <span className="text-xs bg-muted rounded px-2 py-0.5">Jornada cerrada</span>
            </>
          )}
        </div>

        {/* End time row */}
        {entryEndTime && (
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="text-xs text-muted-foreground w-10">Fin</span>
            {editingEnd ? (
              <form onSubmit={saveEndTime} className="flex flex-wrap items-center gap-2 flex-1">
                <DateTimeInput value={endInput} onChange={setEndInput} />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adjustLast}
                    onChange={(e) => setAdjustLast(e.target.checked)}
                    className="rounded"
                  />
                  Mover última tarea
                </label>
                <button
                  type="submit"
                  disabled={savingEnd}
                  className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {savingEnd ? 'Guardando…' : 'Guardar'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingEnd(false)}
                  className="rounded border border-border px-3 py-1 text-xs hover:bg-accent"
                >
                  Cancelar
                </button>
              </form>
            ) : (
              <>
                <button
                  onClick={openEndEdit}
                  className="font-mono font-medium tabular-nums hover:text-primary transition-colors"
                  title="Editar hora de fin"
                >
                  {fmtHHMM(entryEndTime)}
                </button>
                <button
                  onClick={openEndEdit}
                  className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  title="Editar hora de fin"
                >
                  ✎
                </button>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* start time row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-xs text-muted-foreground">Inicio</span>

        {editingStart ? (
          <form onSubmit={saveStartTime} className="flex flex-wrap items-center gap-2 flex-1">
            <DateTimeInput value={startInput} onChange={setStartInput} />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={adjustFirst}
                onChange={(e) => setAdjustFirst(e.target.checked)}
                className="rounded"
              />
              Mover 1ª tarea
            </label>
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
