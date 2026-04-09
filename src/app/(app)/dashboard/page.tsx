import { getSession } from '@/lib/auth/session'
import { listTasksForEntry } from '@/lib/db/queries/tasks'
import { computeEntryWorkedMinutes } from '@/lib/business/balance'
import { autoCreateEntry, todayDateString } from '@/lib/business/tasks'
import { getEntryBreaks, getTotalBreakMinutes } from '@/lib/db/queries/entry-breaks'
import { parseTaskTags } from '@/types/db'
import { TodayStats } from '@/components/dashboard/today-stats'
import { ActiveTaskTimer } from '@/components/dashboard/active-task-timer'
import { TaskList } from '@/components/dashboard/task-list'
import { NewTaskForm } from '@/components/dashboard/new-task-form'
import { DayControls } from '@/components/dashboard/day-controls'
import { DayTimeline } from '@/components/dashboard/day-timeline'
import { BreaksPanel } from '@/components/dashboard/breaks-panel'
import { DailyNotes } from '@/components/dashboard/daily-notes'
import { listEntries, updateEntry } from '@/lib/db/queries/entries'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) return null

  const today = todayDateString()

  // Auto-close any unclosed entries from previous days
  const allEntries = listEntries(session.user.id, undefined, today)
  for (const e of allEntries) {
    if (e.date < today && !e.endTime && e.startTime) {
      const breakMins = getTotalBreakMinutes(e.id)
      const endMs = new Date(e.startTime).getTime() + (e.expectedMinutes + breakMins) * 60_000
      updateEntry(e.id, { endTime: new Date(endMs).toISOString() })
    }
  }

  // Auto-create entry so we always have an entryId available
  const entry = autoCreateEntry(session.user.id, today)
  const rawTasks = listTasksForEntry(entry.id)
  const tasks = rawTasks.map(parseTaskTags)
  const workedMinutes = computeEntryWorkedMinutes(entry.id)
  const breaks = getEntryBreaks(entry.id)
  const totalBreakMinutes = getTotalBreakMinutes(entry.id)
  const activeTask = tasks.find((t) => !t.endTime)
  const completedTasks = tasks.filter((t) => t.endTime)
  const isClosed = !!entry.endTime
  const allTasksSorted = [...tasks].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  )
  const firstTaskStartTime = allTasksSorted[0]?.startTime
  const entryStartTime = entry.startTime ?? new Date().toISOString()

  // Compute expected end time (same formula as TodayStats)
  const refMs = firstTaskStartTime
    ? new Date(firstTaskStartTime).getTime()
    : new Date(entryStartTime).getTime()
  const expectedEndIso = new Date(refMs + (entry.expectedMinutes + totalBreakMinutes) * 60_000).toISOString()

  // Recent entries for notes history (last 6 days before today)
  const recentEntries = allEntries
    .filter((e) => e.date !== today && e.notes)
    .slice(-6)
    .reverse()

  // Default start time for first task = entry start time; otherwise omit (defaults to now)
  const newTaskDefaultStart = allTasksSorted.length === 0 ? entryStartTime : undefined

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">Hoy</h1>
        <span className="text-sm text-muted-foreground">{today}</span>
      </div>

      <DayControls
        entryId={entry.id}
        entryStartTime={entryStartTime}
        expectedEndTime={expectedEndIso}
        isClosed={isClosed}
        activeTaskId={activeTask?.id}
      />

      <TodayStats
        entryStartTime={entryStartTime}
        firstTaskStartTime={firstTaskStartTime}
        completedWorkedMinutes={workedMinutes}
        expectedMinutes={entry.expectedMinutes}
        totalBreakMinutes={totalBreakMinutes}
        activeTaskStartTime={activeTask?.startTime}
      />

      {activeTask && <ActiveTaskTimer task={activeTask} loadedDate={today} />}

      <DayTimeline tasks={allTasksSorted} breaks={breaks} entryDate={today} />

      <BreaksPanel entryId={entry.id} initialBreaks={breaks} />

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">Tareas</h2>
        </div>
        <div className="p-4 space-y-3">
          <TaskList
            tasks={completedTasks}
            entryId={entry.id}
            activeTaskId={activeTask?.id}
          />
          {!isClosed && (
            <NewTaskForm
              entryId={entry.id}
              activeTaskId={activeTask?.id}
              defaultStartTime={newTaskDefaultStart}
            />
          )}
        </div>
      </div>

      <DailyNotes
        entryId={entry.id}
        initialNotes={entry.notes ?? ''}
        recentEntries={recentEntries.map((e) => ({ date: e.date, notes: e.notes ?? '' }))}
      />
    </div>
  )
}
