import { z } from 'zod'
import { NextResponse } from 'next/server'

export function parseBody<T>(schema: z.ZodType<T>, body: unknown):
  | { ok: true; data: T }
  | { ok: false; response: NextResponse } {
  const result = schema.safeParse(body)
  if (!result.success) {
    const message = result.error.issues.map((i) => i.message).join(', ')
    return { ok: false, response: NextResponse.json({ error: message }, { status: 400 }) }
  }
  return { ok: true, data: result.data }
}
