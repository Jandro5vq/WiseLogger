import { getSession } from '@/lib/auth/session'
import { getEntryByDate } from '@/lib/db/queries/entries'
import { listTasksForEntry } from '@/lib/db/queries/tasks'
import { getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { parseTaskTags } from '@/types/db'
import { EntryEditor } from '@/components/history/entry-editor'
import { DayTimeline } from '@/components/dashboard/day-timeline'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function HistoryDatePage({ params }: { params: { date: string } }) {
  const session = await getSession()
  if (!session) return null

  const { date } = params
  const entry = getEntryByDate(session.user.id, date)
  const tasks = entry ? listTasksForEntry(entry.id).map(parseTaskTags) : []
  const breaks = entry ? getEntryBreaks(entry.id) : []
  const sortedTasks = [...tasks].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  )

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/history" className="text-muted-foreground hover:text-foreground transition-colors">
          ← Back
        </Link>
        <h1 className="text-2xl font-bold">{date}</h1>
      </div>

      {sortedTasks.length > 0 && (
        <DayTimeline tasks={sortedTasks} breaks={breaks} entryDate={date} />
      )}

      <EntryEditor date={date} entry={entry} tasks={tasks} />
    </div>
  )
}
