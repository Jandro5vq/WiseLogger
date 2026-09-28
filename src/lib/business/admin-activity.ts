import { db } from '@/lib/db'
import { entries, tasks, users } from '@db/schema'
import { between, count, countDistinct, eq, isNull, max } from 'drizzle-orm'
import { computeBalance } from '@/lib/business/balance'

/**
 * Admin activity pulse. Deliberately coarse: per user it only says *whether/when*
 * the app is used (last login, last activity, active days). Hours and task counts
 * are exposed only as instance-wide totals — never per user.
 */

export interface UserActivity {
  id: string
  username: string
  isActive: boolean
  lastLoginAt: string | null
  lastActivityAt: string | null
  activeDays: number
}

export interface ActivitySummary {
  from: string
  to: string
  totals: {
    users: number
    activeUsers: number
    activeDays: number
    tasks: number
    workedMinutes: number
    runningTasks: number
  }
  perDay: { date: string; activeUsers: number }[]
  users: UserActivity[]
}

/** An "active day" is an entry in [from, to] with at least one task. */
export function computeActivitySummary(from: string, to: string): ActivitySummary {
  const inRange = between(entries.date, from, to)

  const allUsers = db
    .select({
      id: users.id,
      username: users.username,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      timezone: users.timezone,
    })
    .from(users)
    .orderBy(users.username)
    .all()

  const daysByUser = new Map(
    db
      .select({ userId: entries.userId, days: countDistinct(entries.date) })
      .from(entries)
      .innerJoin(tasks, eq(tasks.entryId, entries.id))
      .where(inRange)
      .groupBy(entries.userId)
      .all()
      .map((r) => [r.userId, r.days])
  )

  const perDay = db
    .select({ date: entries.date, activeUsers: countDistinct(entries.userId) })
    .from(entries)
    .innerJoin(tasks, eq(tasks.entryId, entries.id))
    .where(inRange)
    .groupBy(entries.date)
    .orderBy(entries.date)
    .all()

  const taskCount =
    db
      .select({ n: count() })
      .from(tasks)
      .innerJoin(entries, eq(tasks.entryId, entries.id))
      .where(inRange)
      .get()?.n ?? 0

  const runningTasks =
    db.select({ n: count() }).from(tasks).where(isNull(tasks.endTime)).get()?.n ?? 0

  const lastByUser = new Map(
    db
      .select({
        userId: tasks.userId,
        lastStart: max(tasks.startTime),
        lastEnd: max(tasks.endTime),
      })
      .from(tasks)
      .groupBy(tasks.userId)
      .all()
      .map((r) => {
        // Pick the later of the two by timestamp, not by string order.
        const candidates = [r.lastStart, r.lastEnd].filter((v): v is string => !!v)
        const latest = candidates.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null
        return [r.userId, latest]
      })
  )

  let workedMinutes = 0
  for (const u of allUsers) {
    if (!daysByUser.has(u.id)) continue
    workedMinutes += computeBalance(u.id, to, from, u.timezone).totalWorkedMinutes
  }

  const userRows: UserActivity[] = allUsers.map((u) => ({
    id: u.id,
    username: u.username,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    lastActivityAt: lastByUser.get(u.id) ?? null,
    activeDays: daysByUser.get(u.id) ?? 0,
  }))

  return {
    from,
    to,
    totals: {
      users: allUsers.length,
      activeUsers: daysByUser.size,
      activeDays: Array.from(daysByUser.values()).reduce((s, n) => s + n, 0),
      tasks: taskCount,
      workedMinutes,
      runningTasks,
    },
    perDay,
    users: userRows,
  }
}
