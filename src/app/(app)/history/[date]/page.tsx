import { getSession } from '@/lib/auth/session'
import { getEntryByDate } from '@/lib/db/queries/entries'
import { listTasksForEntry } from '@/lib/db/queries/tasks'
import { getEntryBreaks } from '@/lib/db/queries/entry-breaks'
import { breakToInterval } from '@/lib/business/breaks'
import { findEntryOverlaps } from '@/lib/business/overlaps'
import { parseTaskTags } from '@/types/db'
import { EntryEditor } from '@/components/history/entry-editor'
import { DayTimeline } from '@/components/dashboard/day-timeline'
import { BreaksPanel } from '@/components/dashboard/breaks-panel'
import { OverlapsAlert } from '@/components/ui/overlaps-alert'
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
  const overlapPairs = entry ? findEntryOverlaps(entry.id, date) : []

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/history" className="text-muted-foreground hover:text-foreground transition-colors">
          ← Back
        </Link>
        <h1 className="text-2xl font-bold">{date}</h1>
      </div>

      <OverlapsAlert pairs={overlapPairs} />

      {sortedTasks.length > 0 && (
        <DayTimeline tasks={sortedTasks} breaks={breaks} entryDate={date} />
      )}

      {entry && entry.expectedMinutes > 0 && (
        <BreaksPanel entryId={entry.id} entryDate={date} initialBreaks={breaks} />
      )}

      <EntryEditor
        date={date}
        entry={entry}
        tasks={tasks}
        breaks={entry ? breaks.map((b) => { const { startIso, endIso } = breakToInterval(b, date); return { startIso, endIso } }) : []}
      />
    </div>
  )
}
