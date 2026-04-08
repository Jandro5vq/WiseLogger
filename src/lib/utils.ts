import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? '-' : ''
  const abs = Math.abs(Math.round(minutes))
  const h = Math.floor(abs / 60)
  const m = abs % 60
  if (h === 0) return `${sign}${m}m`
  return `${sign}${h}h ${m.toString().padStart(2, '0')}m`
}

/** Format elapsed ms as HH:MM:SS */
export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(Math.abs(ms) / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const mm = m.toString().padStart(2, '0')
  const ss = s.toString().padStart(2, '0')
  if (h > 0) return `${h}:${mm}:${ss}`
  return `${mm}:${ss}`
}

export function formatDuration(startTime: string, endTime?: string | null): string {
  const end = endTime ? new Date(endTime) : new Date()
  const ms = end.getTime() - new Date(startTime).getTime()
  return formatMinutes(ms / 60000)
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

/** Convert a local datetime-local input value to ISO 8601 with local tz offset */
export function localInputToISO(value: string): string {
  if (!value) return new Date().toISOString()
  const d = new Date(value)
  return d.toISOString()
}

/** Format an ISO timestamp for a datetime-local input (YYYY-MM-DDTHH:MM) */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
