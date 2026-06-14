export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getSession } from '@/lib/auth/session'
import { getScheduleRules, createRule } from '@/lib/db/queries/schedule-rules'
import { parseBody } from '@/lib/api'
import { ScheduleRuleCreateSchema } from '@/lib/validation'

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(getScheduleRules(session.user.id))
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = parseBody(ScheduleRuleCreateSchema, await req.json())
  if (!parsed.ok) return parsed.response
  const { ruleType, weekday, month, specificDate, durationMinutes, label } = parsed.data

  const rule = createRule({
    id: uuidv4(),
    userId: session.user.id,
    ruleType,
    weekday: weekday ?? null,
    month: month ?? null,
    specificDate: specificDate ?? null,
    durationMinutes,
    label: label ?? null,
  })

  return NextResponse.json(rule, { status: 201 })
}
