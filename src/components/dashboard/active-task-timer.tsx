'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatElapsed, todayISO } from '@/lib/utils'
import type { TaskWithTags } from '@/types/db'

interface ActiveTaskTimerProps {
  task: TaskWithTags
  loadedDate: string
}

export function ActiveTaskTimer({ task, loadedDate }: ActiveTaskTimerProps) {
  const router = useRouter()
  const [elapsedMs, setElapsedMs] = useState(0)
  const [stopping, setStopping] = useState(false)

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

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="animate-pulse w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-sm font-medium">Tarea activa</span>
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
    </div>
  )
}
