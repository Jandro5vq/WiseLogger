'use client'

import { useEffect, useState } from 'react'
import { formatMinutes } from '@/lib/utils'
import { TimeInput } from '@/components/ui/time-input'

// ─── Break rules ─────────────────────────────────────────────────────────────

interface BreakRule {
  id: string
  ruleType: 'always' | 'schedule_duration' | 'weekday'
  scheduleDuration: number | null
  weekday: number | null
  breakStart: string   // 'HH:MM'
  durationMinutes: number
  label: string | null
}

function breakRuleLabel(rule: BreakRule): string {
  if (rule.label) return rule.label
  if (rule.ruleType === 'always') return 'Todos los días'
  if (rule.ruleType === 'schedule_duration') return `En jornadas de ${formatMinutes(rule.scheduleDuration ?? 0)}`
  if (rule.ruleType === 'weekday') return WEEKDAY_NAMES[rule.weekday ?? 0]
  return rule.ruleType
}

function BreakRuleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: BreakRule
  onSave: (rule: BreakRule) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    ruleType: initial?.ruleType ?? 'always',
    scheduleDuration: initial?.scheduleDuration != null ? String(initial.scheduleDuration) : '',
    weekday: initial?.weekday != null ? String(initial.weekday) : '',
    breakStart: initial?.breakStart ?? '',
    duration: String(initial?.durationMinutes ?? 30),
    label: initial?.label ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const durationMinutes = parseInt(form.duration)
    if (!form.breakStart) { setError('Break start time is required'); return }
    if (isNaN(durationMinutes) || durationMinutes <= 0) { setError('Duration must be positive'); return }

    const body: Record<string, unknown> = {
      ruleType: form.ruleType,
      breakStart: form.breakStart,
      durationMinutes,
      label: form.label || null,
      scheduleDuration: form.ruleType === 'schedule_duration' ? parseInt(form.scheduleDuration) : null,
      weekday: form.ruleType === 'weekday' ? parseInt(form.weekday) : null,
    }

    setSaving(true)
    const url = initial ? `/api/break-rules/${initial.id}` : '/api/break-rules'
    const method = initial ? 'PATCH' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Failed'); return }
    onSave(data)
  }

  return (
    <form onSubmit={save} className="rounded-lg border border-primary/30 bg-card p-4 space-y-3 mt-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Applies</label>
          <select
            value={form.ruleType}
            onChange={(e) => set('ruleType', e.target.value)}
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="always">Todos los días</option>
            <option value="schedule_duration">En jornadas de duración específica</option>
            <option value="weekday">En día de la semana concreto</option>
          </select>
        </div>

        {form.ruleType === 'schedule_duration' && (
          <div>
            <label className="text-xs text-muted-foreground">Duración de jornada (minutos)</label>
            <input
              type="number"
              min={1}
              value={form.scheduleDuration}
              onChange={(e) => set('scheduleDuration', e.target.value)}
              placeholder="p. ej. 495 para 8h15m"
              required
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}

        {form.ruleType === 'weekday' && (
          <div>
            <label className="text-xs text-muted-foreground">Día de la semana</label>
            <select
              value={form.weekday}
              onChange={(e) => set('weekday', e.target.value)}
              required
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Seleccionar…</option>
              {WEEKDAY_NAMES.map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Inicio de pausa</label>
          <TimeInput
            value={form.breakStart}
            onChange={(v) => set('breakStart', v)}
            required
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Duración (min)</label>
          <input
            type="number"
            min={1}
            max={480}
            value={form.duration}
            onChange={(e) => set('duration', e.target.value)}
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Etiqueta (opcional)</label>
          <input
            type="text"
            value={form.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder="p. ej. Comida"
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? 'Guardando…' : initial ? 'Actualizar' : 'Añadir regla de pausa'}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-border px-3 py-1.5 text-xs hover:bg-accent">
          Cancelar
        </button>
      </div>
    </form>
  )
}

interface ScheduleRule {
  id: string
  ruleType: string
  weekday: number | null
  month: number | null
  specificDate: string | null
  durationMinutes: number
  label: string | null
}

// ─── MCP config examples ─────────────────────────────────────────────────────

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <button
          onClick={copy}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          {copied ? (
            <span className="text-green-600 dark:text-green-400 font-medium">✓ Copied</span>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="text-xs p-3 overflow-x-auto text-foreground/80 leading-relaxed">{code}</pre>
    </div>
  )
}

function McpConfigExamples({ apiKey }: { apiKey: string | null }) {
  const [open, setOpen] = useState(false)
  const key = apiKey ?? 'YOUR_MCP_API_KEY'
  const url = typeof window !== 'undefined' ? `${window.location.origin}/api/mcp` : 'https://your-domain/api/mcp'

  const vscodeConfig = JSON.stringify({
    servers: {
      wiselogger: {
        type: 'http',
        url,
        headers: { Authorization: `Bearer ${key}` },
      },
    },
  }, null, 2)

  const claudeDesktopConfig = JSON.stringify({
    mcpServers: {
      wiselogger: {
        type: 'http',
        url,
        headers: { Authorization: `Bearer ${key}` },
      },
    },
  }, null, 2)

  const claudeCodeCmd = `claude mcp add --transport http wiselogger ${url} \\\n  -H "Authorization: Bearer ${key}"`

  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        Cómo conectar un asistente de IA
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
            La URL del servidor MCP es <code className="font-mono text-foreground/80">{url}</code>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              VS Code — GitHub Copilot
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Añade a <code className="font-mono">.vscode/mcp.json</code> en tu workspace, o a los ajustes de usuario de VS Code bajo <code className="font-mono">mcp.servers</code>.
            </p>
            <CodeBlock code={vscodeConfig} label=".vscode/mcp.json" />
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Claude Desktop
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Añade a <code className="font-mono">claude_desktop_config.json</code> — en macOS en{' '}
              <code className="font-mono">~/Library/Application Support/Claude/</code>.
            </p>
            <CodeBlock code={claudeDesktopConfig} label="claude_desktop_config.json" />
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Claude Code (CLI)
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Ejecuta una vez en tu terminal para registrar el servidor:
            </p>
            <CodeBlock code={claudeCodeCmd} label="Terminal" />
          </div>
        </div>
      )}
    </div>
  )
}

const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function ruleLabel(rule: ScheduleRule): string {
  if (rule.label) return rule.label
  switch (rule.ruleType) {
    case 'default': return 'Por defecto (todos los días)'
    case 'weekday': return WEEKDAY_NAMES[rule.weekday ?? 0]
    case 'month': return MONTH_NAMES[(rule.month ?? 1) - 1]
    case 'date': return rule.specificDate ?? 'Fecha específica'
    default: return rule.ruleType
  }
}

const BLANK_FORM = {
  ruleType: 'default',
  weekday: '',
  month: '',
  specificDate: '',
  hours: '8',
  minutes: '15',
  label: '',
}

function minutesToHM(min: number) {
  return { h: Math.floor(min / 60), m: min % 60 }
}

function RuleForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ScheduleRule
  onSave: (rule: ScheduleRule) => void
  onCancel: () => void
}) {
  const hm = initial ? minutesToHM(initial.durationMinutes) : { h: 8, m: 15 }
  const [form, setForm] = useState({
    ruleType: initial?.ruleType ?? 'default',
    weekday: initial?.weekday != null ? String(initial.weekday) : '',
    month: initial?.month != null ? String(initial.month) : '',
    specificDate: initial?.specificDate ?? '',
    hours: String(hm.h),
    minutes: String(hm.m),
    label: initial?.label ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const durationMinutes = parseInt(form.hours) * 60 + parseInt(form.minutes)
    if (isNaN(durationMinutes) || durationMinutes <= 0) {
      setError('Duration must be positive')
      return
    }

    const body: Record<string, unknown> = {
      ruleType: form.ruleType,
      durationMinutes,
      label: form.label || null,
    }
    if (form.ruleType === 'weekday' || (form.ruleType === 'month' && form.weekday)) {
      body.weekday = parseInt(form.weekday)
    }
    if (form.ruleType === 'month') {
      body.month = parseInt(form.month)
    }
    if (form.ruleType === 'date') {
      body.specificDate = form.specificDate
    }

    setSaving(true)
    const url = initial ? `/api/schedule-rules/${initial.id}` : '/api/schedule-rules'
    const method = initial ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Failed'); return }
    onSave(data)
  }

  return (
    <form onSubmit={save} className="rounded-lg border border-primary/30 bg-card p-4 space-y-3 mt-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Tipo de regla</label>
          <select
            value={form.ruleType}
            onChange={(e) => set('ruleType', e.target.value)}
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="default">Por defecto</option>
            <option value="weekday">Día de la semana</option>
            <option value="month">Mes</option>
            <option value="date">Fecha específica</option>
          </select>
        </div>

        {(form.ruleType === 'weekday' || form.ruleType === 'month') && (
          <div>
            <label className="text-xs text-muted-foreground">Día de la semana</label>
            <select
              value={form.weekday}
              onChange={(e) => set('weekday', e.target.value)}
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Cualquiera</option>
              {WEEKDAY_NAMES.map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
          </div>
        )}

        {form.ruleType === 'month' && (
          <div>
            <label className="text-xs text-muted-foreground">Mes</label>
            <select
              value={form.month}
              onChange={(e) => set('month', e.target.value)}
              required
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Seleccionar…</option>
              {MONTH_NAMES.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
        )}

        {form.ruleType === 'date' && (
          <div>
            <label className="text-xs text-muted-foreground">Fecha</label>
            <input
              type="date"
              value={form.specificDate}
              onChange={(e) => set('specificDate', e.target.value)}
              required
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Duración</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={23}
              value={form.hours}
              onChange={(e) => set('hours', e.target.value)}
              className="w-16 rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">h</span>
            <input
              type="number"
              min={0}
              max={59}
              value={form.minutes}
              onChange={(e) => set('minutes', e.target.value)}
              className="w-16 rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">m</span>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Etiqueta (opcional)</label>
          <input
            type="text"
            value={form.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder="p. ej. Horario de verano"
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : initial ? 'Actualizar regla' : 'Añadir regla'}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-border px-3 py-1.5 text-xs hover:bg-accent">
          Cancelar
        </button>
      </div>
    </form>
  )
}

// Curated IANA timezone list covering all major regions and UTC offsets.
// Used for the timezone search dropdown in settings.
const IANA_TIMEZONES = [
  'UTC',
  // Americas
  'America/Adak', 'America/Anchorage', 'America/Boise', 'America/Chicago',
  'America/Denver', 'America/Detroit', 'America/Indiana/Indianapolis',
  'America/Los_Angeles', 'America/New_York', 'America/Phoenix',
  'America/Juneau', 'America/Honolulu',
  'America/Argentina/Buenos_Aires', 'America/Argentina/Cordoba',
  'America/Bogota', 'America/Caracas', 'America/Guayaquil',
  'America/Halifax', 'America/Lima', 'America/Mexico_City',
  'America/Monterrey', 'America/Montevideo', 'America/Noronha',
  'America/Puerto_Rico', 'America/Santiago', 'America/Sao_Paulo',
  'America/St_Johns', 'America/Tegucigalpa', 'America/Toronto',
  'America/Vancouver', 'America/Winnipeg',
  // Europe
  'Europe/Amsterdam', 'Europe/Athens', 'Europe/Belgrade', 'Europe/Berlin',
  'Europe/Brussels', 'Europe/Bucharest', 'Europe/Budapest',
  'Europe/Copenhagen', 'Europe/Dublin', 'Europe/Helsinki',
  'Europe/Istanbul', 'Europe/Kaliningrad', 'Europe/Kiev',
  'Europe/Lisbon', 'Europe/London', 'Europe/Luxembourg',
  'Europe/Madrid', 'Europe/Minsk', 'Europe/Moscow',
  'Europe/Oslo', 'Europe/Paris', 'Europe/Prague',
  'Europe/Riga', 'Europe/Rome', 'Europe/Samara',
  'Europe/Sofia', 'Europe/Stockholm', 'Europe/Tallinn',
  'Europe/Ulyanovsk', 'Europe/Vilnius', 'Europe/Warsaw',
  'Europe/Vienna', 'Europe/Zurich',
  // Africa
  'Africa/Abidjan', 'Africa/Accra', 'Africa/Addis_Ababa', 'Africa/Algiers',
  'Africa/Cairo', 'Africa/Casablanca', 'Africa/Johannesburg',
  'Africa/Khartoum', 'Africa/Lagos', 'Africa/Maputo',
  'Africa/Nairobi', 'Africa/Tripoli', 'Africa/Tunis',
  // Asia
  'Asia/Almaty', 'Asia/Amman', 'Asia/Anadyr', 'Asia/Aqtau',
  'Asia/Baghdad', 'Asia/Bahrain', 'Asia/Baku', 'Asia/Bangkok',
  'Asia/Beirut', 'Asia/Bishkek', 'Asia/Calcutta', 'Asia/Colombo',
  'Asia/Damascus', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Dushanbe',
  'Asia/Gaza', 'Asia/Ho_Chi_Minh', 'Asia/Hong_Kong', 'Asia/Irkutsk',
  'Asia/Jakarta', 'Asia/Jerusalem', 'Asia/Kabul', 'Asia/Kamchatka',
  'Asia/Karachi', 'Asia/Kathmandu', 'Asia/Kolkata', 'Asia/Krasnoyarsk',
  'Asia/Kuala_Lumpur', 'Asia/Kuwait', 'Asia/Magadan', 'Asia/Makassar',
  'Asia/Manila', 'Asia/Muscat', 'Asia/Nicosia', 'Asia/Novosibirsk',
  'Asia/Omsk', 'Asia/Qatar', 'Asia/Riyadh', 'Asia/Samarkand',
  'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tashkent',
  'Asia/Tbilisi', 'Asia/Tehran', 'Asia/Thimphu', 'Asia/Tokyo',
  'Asia/Ulaanbaatar', 'Asia/Vladivostok', 'Asia/Yakutsk', 'Asia/Yekaterinburg',
  'Asia/Yerevan',
  // Oceania
  'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Darwin',
  'Australia/Hobart', 'Australia/Lord_Howe', 'Australia/Melbourne',
  'Australia/Perth', 'Australia/Sydney',
  'Pacific/Auckland', 'Pacific/Chatham', 'Pacific/Easter',
  'Pacific/Fiji', 'Pacific/Galapagos', 'Pacific/Gambier',
  'Pacific/Guadalcanal', 'Pacific/Guam', 'Pacific/Honolulu',
  'Pacific/Kiritimati', 'Pacific/Marquesas', 'Pacific/Noumea',
  'Pacific/Pago_Pago', 'Pacific/Palau', 'Pacific/Port_Moresby',
  'Pacific/Tahiti', 'Pacific/Tarawa', 'Pacific/Tongatapu',
]

const WEEKEND_KEY = 'wl:showWeekends'

function WeekendToggle() {
  const [showWeekends, setShowWeekends] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(WEEKEND_KEY) === 'true'
  })

  function toggle() {
    setShowWeekends((v) => {
      const next = !v
      localStorage.setItem(WEEKEND_KEY, String(next))
      return next
    })
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">Mostrar fin de semana</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Muestra sábado y domingo en la vista semanal del historial
        </p>
      </div>
      <button
        onClick={toggle}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          showWeekends ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            showWeekends ? 'translate-x-4' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

function WorkdayAdjustToggle({
  storageKey,
  label,
  description,
}: {
  storageKey: string
  label: string
  description: string
}) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = localStorage.getItem(storageKey)
    return stored === null ? true : stored === 'true'
  })

  function toggle() {
    setValue((v) => {
      const next = !v
      localStorage.setItem(storageKey, String(next))
      return next
    })
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <button
        onClick={toggle}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          value ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-4' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

export default function SettingsPage() {
  const [rules, setRules] = useState<ScheduleRule[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [breakRules, setBreakRules] = useState<BreakRule[]>([])
  const [showAddBreak, setShowAddBreak] = useState(false)
  const [editingBreakId, setEditingBreakId] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [generatingKey, setGeneratingKey] = useState(false)
  const [username, setUsername] = useState('')
  const [usernameMsg, setUsernameMsg] = useState('')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordMsg, setPasswordMsg] = useState('')
  const [timezone, setTimezone] = useState('UTC')
  const [timezoneMsg, setTimezoneMsg] = useState('')
  const [tzSearch, setTzSearch] = useState('')

  useEffect(() => {
    fetch('/api/schedule-rules').then((r) => r.json()).then(setRules).catch(() => {})
    fetch('/api/break-rules').then((r) => r.json()).then(setBreakRules).catch(() => {})
    fetch('/api/auth/me').then((r) => r.json()).then((u) => {
      setUsername(u.username ?? '')
      setTimezone(u.timezone ?? 'UTC')
    }).catch(() => {})
  }, [])

  async function deleteRule(id: string) {
    await fetch(`/api/schedule-rules/${id}`, { method: 'DELETE' })
    setRules((prev) => prev.filter((r) => r.id !== id))
  }

  function handleSaved(rule: ScheduleRule) {
    setRules((prev) => {
      const idx = prev.findIndex((r) => r.id === rule.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = rule
        return next
      }
      return [...prev, rule]
    })
    setShowAddForm(false)
    setEditingId(null)
  }

  async function deleteBreakRule(id: string) {
    await fetch(`/api/break-rules/${id}`, { method: 'DELETE' })
    setBreakRules((prev) => prev.filter((r) => r.id !== id))
  }

  function handleBreakSaved(rule: BreakRule) {
    setBreakRules((prev) => {
      const idx = prev.findIndex((r) => r.id === rule.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = rule; return next }
      return [...prev, rule]
    })
    setShowAddBreak(false)
    setEditingBreakId(null)
  }

  async function generateApiKey() {
    setGeneratingKey(true)
    const res = await fetch('/api/auth/me/regenerate-mcp-key', { method: 'POST' })
    const data = await res.json()
    setGeneratingKey(false)
    if (res.ok) setApiKey(data.apiKey)
  }

  async function changeTimezone(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone }),
    })
    const data = await res.json()
    setTimezoneMsg(res.ok ? 'ok' : (data.error ?? 'Error'))
    if (res.ok) setTimeout(() => setTimezoneMsg(''), 2500)
  }

  async function changeUsername(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    })
    const data = await res.json()
    setUsernameMsg(res.ok ? 'Username updated' : (data.error ?? 'Failed'))
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword, newPassword }),
    })
    const data = await res.json()
    setPasswordMsg(res.ok ? 'Password changed successfully' : (data.error ?? 'Failed'))
    if (res.ok) { setOldPassword(''); setNewPassword('') }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Ajustes</h1>

      {/* Horario de trabajo */}
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Horario de trabajo</h2>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              + Añadir regla
            </button>
          )}
        </div>

        <div className="space-y-1">
          {rules.map((rule) => (
            <div key={rule.id}>
              {editingId === rule.id ? (
                <RuleForm
                  initial={rule}
                  onSave={handleSaved}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <span className="text-sm font-medium">{ruleLabel(rule)}</span>
                    <span className="text-xs text-muted-foreground ml-2">{formatMinutes(rule.durationMinutes)}</span>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setEditingId(rule.id)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {rules.length === 0 && !showAddForm && (
            <p className="text-sm text-muted-foreground">Sin reglas definidas. Se usa el valor por defecto de 8h15m.</p>
          )}
        </div>

        {showAddForm && (
          <RuleForm
            onSave={handleSaved}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {/* Prioridades del sistema de horarios */}
        <details className="mt-4 group">
          <summary className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer list-none select-none">
            <span className="transition-transform group-open:rotate-90">▶</span>
            Prioridades de las reglas
          </summary>
          <div className="mt-3 rounded-md border border-border overflow-hidden text-xs">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Prioridad</th>
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Tipo de regla</th>
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Descripción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr><td className="px-3 py-2 font-mono text-primary">1 (máx)</td><td className="px-3 py-2">Fecha específica</td><td className="px-3 py-2 text-muted-foreground">Coincide con un día exacto (YYYY-MM-DD)</td></tr>
                <tr><td className="px-3 py-2 font-mono">2</td><td className="px-3 py-2">Mes + día de semana</td><td className="px-3 py-2 text-muted-foreground">P. ej., viernes de agosto</td></tr>
                <tr><td className="px-3 py-2 font-mono">3</td><td className="px-3 py-2">Mes (todos los días)</td><td className="px-3 py-2 text-muted-foreground">Aplica a todos los días de un mes</td></tr>
                <tr><td className="px-3 py-2 font-mono">4</td><td className="px-3 py-2">Día de la semana</td><td className="px-3 py-2 text-muted-foreground">P. ej., todos los viernes</td></tr>
                <tr><td className="px-3 py-2 font-mono text-muted-foreground">5 (mín)</td><td className="px-3 py-2">Por defecto</td><td className="px-3 py-2 text-muted-foreground">Fallback para cualquier día sin regla más específica</td></tr>
              </tbody>
            </table>
          </div>
        </details>
      </section>

      {/* Reglas de pausas */}
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Pausas programadas</h2>
          {!showAddBreak && (
            <button
              onClick={() => setShowAddBreak(true)}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              + Añadir regla
            </button>
          )}
        </div>

        <div className="space-y-1">
          {breakRules.map((rule) => (
            <div key={rule.id}>
              {editingBreakId === rule.id ? (
                <BreakRuleForm
                  initial={rule}
                  onSave={handleBreakSaved}
                  onCancel={() => setEditingBreakId(null)}
                />
              ) : (
                <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <span className="text-sm font-medium">{breakRuleLabel(rule)}</span>
                    <span className="text-xs text-muted-foreground ml-2 font-mono">{rule.breakStart}</span>
                    <span className="text-xs text-muted-foreground ml-1">{rule.durationMinutes}m</span>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setEditingBreakId(rule.id)} className="text-xs text-muted-foreground hover:text-foreground">Editar</button>
                    <button onClick={() => deleteBreakRule(rule.id)} className="text-xs text-muted-foreground hover:text-destructive">Eliminar</button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {breakRules.length === 0 && !showAddBreak && (
            <p className="text-sm text-muted-foreground">Sin reglas de pausa definidas.</p>
          )}
        </div>

        {showAddBreak && (
          <BreakRuleForm
            onSave={handleBreakSaved}
            onCancel={() => setShowAddBreak(false)}
          />
        )}
      </section>

      {/* Calendario */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Calendario</h2>
        <WeekendToggle />
      </section>

      {/* Edición de jornada */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-1">Edición de jornada</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Comportamiento por defecto al modificar el inicio o fin de una jornada. Se puede cambiar por operación.
        </p>
        <div className="space-y-4">
          <WorkdayAdjustToggle
            storageKey="wl:adjustFirstTask"
            label="Ajustar 1ª tarea al cambiar hora de inicio"
            description="Mueve el inicio de la primera tarea del día para que coincida con la nueva hora de inicio de jornada"
          />
          <WorkdayAdjustToggle
            storageKey="wl:adjustLastTask"
            label="Ajustar última tarea al cambiar hora de fin"
            description="Mueve el fin de la última tarea del día para que coincida con la nueva hora de cierre de jornada"
          />
        </div>
      </section>

      {/* MCP API key */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-2">Clave API MCP</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Usa esta clave para conectar asistentes de IA (Claude, Copilot) a tus datos de WiseLogger.
        </p>
        {apiKey ? (
          <div className="rounded-md bg-muted p-3">
            <p className="text-xs text-muted-foreground mb-1">Copia esta clave — no volverá a mostrarse:</p>
            <code className="text-sm break-all select-all">{apiKey}</code>
          </div>
        ) : (
          <button
            onClick={generateApiKey}
            disabled={generatingKey}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {generatingKey ? 'Generando…' : 'Generar nueva clave'}
          </button>
        )}

        <McpConfigExamples apiKey={apiKey} />
      </section>

      {/* Zona horaria */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-1">Zona horaria</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Todas las horas se almacenan en UTC. Esta zona se usa para mostrar y convertir las horas a tu hora local.
        </p>
        <form onSubmit={changeTimezone} className="space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="block text-xs text-muted-foreground">Zona horaria seleccionada</label>
              <button
                type="button"
                onClick={() => {
                  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
                  setTimezone(detected)
                  setTzSearch('')
                }}
                className="text-xs text-primary hover:underline"
              >
                Detectar automáticamente
              </button>
            </div>
            <input
              type="text"
              placeholder="Buscar zona horaria…"
              value={tzSearch || timezone}
              onChange={(e) => {
                setTzSearch(e.target.value)
              }}
              onFocus={() => setTzSearch(timezone)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {tzSearch && (
              <div className="mt-1 rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-auto">
                {IANA_TIMEZONES
                  .filter((tz) => tz.toLowerCase().includes(tzSearch.toLowerCase()))
                  .slice(0, 50)
                  .map((tz) => (
                    <button
                      key={tz}
                      type="button"
                      onMouseDown={() => { setTimezone(tz); setTzSearch('') }}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors ${tz === timezone ? 'font-medium text-primary' : ''}`}
                    >
                      {tz}
                    </button>
                  ))
                }
                {IANA_TIMEZONES.filter((tz) => tz.toLowerCase().includes(tzSearch.toLowerCase())).length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Guardar zona horaria
            </button>
            {timezoneMsg && (
              <span className={`text-sm ${timezoneMsg === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                {timezoneMsg === 'ok' ? 'Zona horaria guardada' : timezoneMsg}
              </span>
            )}
          </div>
        </form>
      </section>

      {/* Nombre de usuario */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Nombre de usuario</h2>
        <form onSubmit={changeUsername} className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs text-muted-foreground mb-1">Nombre visible</label>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setUsernameMsg('') }}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Guardar
          </button>
        </form>
        {usernameMsg && (
          <p className={`text-sm mt-2 ${usernameMsg.includes('actualizado') || usernameMsg.includes('updated') ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
            {usernameMsg === 'Username updated' ? 'Nombre actualizado' : usernameMsg}
          </p>
        )}
      </section>

      {/* Cambiar contraseña */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Cambiar contraseña</h2>
        <form onSubmit={changePassword} className="space-y-3">
          <input
            type="password"
            placeholder="Contraseña actual"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="password"
            placeholder="Nueva contraseña (mín. 8 caracteres)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {passwordMsg && <p className="text-sm text-muted-foreground">{passwordMsg === 'Password changed successfully' ? 'Contraseña cambiada correctamente' : passwordMsg}</p>}
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Cambiar contraseña
          </button>
        </form>
      </section>
    </div>
  )
}
