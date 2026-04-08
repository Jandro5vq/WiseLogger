import { getSession } from '@/lib/auth/session'
import { getEntryByDate } from '@/lib/db/queries/entries'
import { listTasksForEntry } from '@/lib/db/queries/tasks'
import { parseTaskTags } from '@/types/db'
import { EntryEditor } from '@/components/history/entry-editor'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function HistoryDatePage({ params }: { params: { date: string } }) {
  const session = await getSession()
  if (!session) return null

  const { date } = params
  const entry = getEntryByDate(session.user.id, date)
  const tasks = entry ? listTasksForEntry(entry.id).map(parseTaskTags) : []

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/history" className="text-muted-foreground hover:text-foreground transition-colors">
          ← Back
        </Link>
        <h1 className="text-2xl font-bold">{date}</h1>
      </div>

      <EntryEditor date={date} entry={entry} tasks={tasks} />
    </div>
  )
}
