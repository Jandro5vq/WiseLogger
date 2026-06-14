export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getSession } from '@/lib/auth/session'
import { getBreakRules, createBreakRule } from '@/lib/db/queries/break-rules'
import { parseBody } from '@/lib/api'
import { BreakRuleCreateSchema } from '@/lib/validation'

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(getBreakRules(session.user.id))
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = parseBody(BreakRuleCreateSchema, await req.json())
  if (!parsed.ok) return parsed.response
  const { ruleType, scheduleDuration, weekday, breakStart, durationMinutes, label } = parsed.data

  const rule = createBreakRule({
    id: uuidv4(),
    userId: session.user.id,
    ruleType,
    scheduleDuration: scheduleDuration ?? null,
    weekday: weekday ?? null,
    breakStart,
    durationMinutes,
    label: label ?? null,
  })

  return NextResponse.json(rule, { status: 201 })
}
