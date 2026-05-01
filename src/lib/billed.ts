import type { TaskWithTags } from '@/types/db'

export const BILLED_KEY = 'wl:billed'
export const BILLED_VERSION_KEY = 'wl:billedVersion'
export const BILLED_VERSION = '2'

export type BilledMap = Map<string, string> // `date::description` → signature

export function loadBilled(): BilledMap {
  if (typeof window === 'undefined') return new Map()
  try {
    if (localStorage.getItem(BILLED_VERSION_KEY) !== BILLED_VERSION) {
      localStorage.removeItem(BILLED_KEY)
      localStorage.setItem(BILLED_VERSION_KEY, BILLED_VERSION)
      return new Map()
    }
    const raw = localStorage.getItem(BILLED_KEY)
    if (!raw) return new Map()
    const obj = JSON.parse(raw) as Record<string, string>
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 56)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const map = new Map<string, string>()
    for (const [k, v] of Object.entries(obj)) {
      if (k.slice(0, 10) >= cutoffStr) map.set(k, v)
    }
    if (map.size < Object.keys(obj).length) saveBilled(map)
    return map
  } catch { return new Map() }
}

export function saveBilled(map: BilledMap) {
  const obj: Record<string, string> = {}
  map.forEach((v, k) => { obj[k] = v })
  localStorage.setItem(BILLED_KEY, JSON.stringify(obj))
  localStorage.setItem(BILLED_VERSION_KEY, BILLED_VERSION)
}

export function billedKey(date: string, description: string) {
  return `${date}::${description}`
}

function djb2(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export function groupSignature(tasks: TaskWithTags[]): string {
  const parts = [...tasks]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((t) => [
      t.id,
      t.startTime,
      t.endTime ?? '',
      (t.tags ?? []).join(','),
      t.notes ?? '',
      t.description,
    ].join('|'))
    .join('\n')
  return djb2(parts)
}
