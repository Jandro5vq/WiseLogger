'use client'

import { useEffect, useState } from 'react'
import { formatMinutes } from '@/lib/utils'

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
  if (rule.ruleType === 'always') return 'Every day'
  if (rule.ruleType === 'schedule_duration') return `On ${formatMinutes(rule.scheduleDuration ?? 0)} days`
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
            <option value="always">Every day</option>
            <option value="schedule_duration">On specific schedule duration</option>
            <option value="weekday">On specific weekday</option>
          </select>
        </div>

        {form.ruleType === 'schedule_duration' && (
          <div>
            <label className="text-xs text-muted-foreground">Schedule duration (minutes)</label>
            <input
              type="number"
              min={1}
              value={form.scheduleDuration}
              onChange={(e) => set('scheduleDuration', e.target.value)}
              placeholder="e.g. 495 for 8h15m"
              required
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}

        {form.ruleType === 'weekday' && (
          <div>
            <label className="text-xs text-muted-foreground">Weekday</label>
            <select
              value={form.weekday}
              onChange={(e) => set('weekday', e.target.value)}
              required
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select…</option>
              {WEEKDAY_NAMES.map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Break start</label>
          <input
            type="time"
            value={form.breakStart}
            onChange={(e) => set('breakStart', e.target.value)}
            required
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Duration (min)</label>
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
          <label className="text-xs text-muted-foreground">Label (optional)</label>
          <input
            type="text"
            value={form.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder="e.g. Lunch"
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? 'Saving…' : initial ? 'Update' : 'Add break rule'}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-border px-3 py-1.5 text-xs hover:bg-accent">
          Cancel
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
        How to connect an AI assistant
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
            The MCP server URL is <code className="font-mono text-foreground/80">{url}</code>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              VS Code — GitHub Copilot
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Add to <code className="font-mono">.vscode/mcp.json</code> in your workspace, or to VS Code user settings under <code className="font-mono">mcp.servers</code>.
            </p>
            <CodeBlock code={vscodeConfig} label=".vscode/mcp.json" />
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Claude Desktop
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Add to <code className="font-mono">claude_desktop_config.json</code> — on macOS at{' '}
              <code className="font-mono">~/Library/Application Support/Claude/</code>.
            </p>
            <CodeBlock code={claudeDesktopConfig} label="claude_desktop_config.json" />
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Claude Code (CLI)
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              Run once in your terminal to register the server:
            </p>
            <CodeBlock code={claudeCodeCmd} label="Terminal" />
          </div>
        </div>
      )}
    </div>
  )
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function ruleLabel(rule: ScheduleRule): string {
  if (rule.label) return rule.label
  switch (rule.ruleType) {
    case 'default': return 'Default (all days)'
    case 'weekday': return WEEKDAY_NAMES[rule.weekday ?? 0]
    case 'month': return MONTH_NAMES[(rule.month ?? 1) - 1]
    case 'date': return rule.specificDate ?? 'Specific date'
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
          <label className="text-xs text-muted-foreground">Rule type</label>
          <select
            value={form.ruleType}
            onChange={(e) => set('ruleType', e.target.value)}
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="default">Default</option>
            <option value="weekday">Weekday</option>
            <option value="month">Month</option>
            <option value="date">Specific date</option>
          </select>
        </div>

        {(form.ruleType === 'weekday' || form.ruleType === 'month') && (
          <div>
            <label className="text-xs text-muted-foreground">Weekday</label>
            <select
              value={form.weekday}
              onChange={(e) => set('weekday', e.target.value)}
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Any</option>
              {WEEKDAY_NAMES.map((d, i) => (
                <option key={i} value={i}>{d}</option>
              ))}
            </select>
          </div>
        )}

        {form.ruleType === 'month' && (
          <div>
            <label className="text-xs text-muted-foreground">Month</label>
            <select
              value={form.month}
              onChange={(e) => set('month', e.target.value)}
              required
              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select…</option>
              {MONTH_NAMES.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
        )}

        {form.ruleType === 'date' && (
          <div>
            <label className="text-xs text-muted-foreground">Date</label>
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
          <label className="text-xs text-muted-foreground">Duration</label>
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
          <label className="text-xs text-muted-foreground">Label (optional)</label>
          <input
            type="text"
            value={form.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder="e.g. Summer hours"
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
          {saving ? 'Saving…' : initial ? 'Update rule' : 'Add rule'}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-border px-3 py-1.5 text-xs hover:bg-accent">
          Cancel
        </button>
      </div>
    </form>
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

  useEffect(() => {
    fetch('/api/schedule-rules').then((r) => r.json()).then(setRules).catch(() => {})
    fetch('/api/break-rules').then((r) => r.json()).then(setBreakRules).catch(() => {})
    fetch('/api/auth/me').then((r) => r.json()).then((u) => setUsername(u.username ?? '')).catch(() => {})
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
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Schedule rules */}
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Work schedule</h2>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              + Add rule
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
                      Edit
                    </button>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {rules.length === 0 && !showAddForm && (
            <p className="text-sm text-muted-foreground">No rules defined. Using default 8h15m.</p>
          )}
        </div>

        {showAddForm && (
          <RuleForm
            onSave={handleSaved}
            onCancel={() => setShowAddForm(false)}
          />
        )}
      </section>

      {/* Break rules */}
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Scheduled breaks</h2>
          {!showAddBreak && (
            <button
              onClick={() => setShowAddBreak(true)}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              + Add rule
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
                    <button onClick={() => setEditingBreakId(rule.id)} className="text-xs text-muted-foreground hover:text-foreground">Edit</button>
                    <button onClick={() => deleteBreakRule(rule.id)} className="text-xs text-muted-foreground hover:text-destructive">Remove</button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {breakRules.length === 0 && !showAddBreak && (
            <p className="text-sm text-muted-foreground">No break rules defined.</p>
          )}
        </div>

        {showAddBreak && (
          <BreakRuleForm
            onSave={handleBreakSaved}
            onCancel={() => setShowAddBreak(false)}
          />
        )}
      </section>

      {/* MCP API key */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-2">MCP API Key</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Use this key to connect AI assistants (Claude, Copilot) to your WiseLogger data.
        </p>
        {apiKey ? (
          <div className="rounded-md bg-muted p-3">
            <p className="text-xs text-muted-foreground mb-1">Copy this key — it will not be shown again:</p>
            <code className="text-sm break-all select-all">{apiKey}</code>
          </div>
        ) : (
          <button
            onClick={generateApiKey}
            disabled={generatingKey}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {generatingKey ? 'Generating…' : 'Generate new key'}
          </button>
        )}

        <McpConfigExamples apiKey={apiKey} />
      </section>

      {/* Username */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Username</h2>
        <form onSubmit={changeUsername} className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs text-muted-foreground mb-1">Display name</label>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setUsernameMsg('') }}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Save
          </button>
        </form>
        {usernameMsg && (
          <p className={`text-sm mt-2 ${usernameMsg === 'Username updated' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
            {usernameMsg}
          </p>
        )}
      </section>

      {/* Change password */}
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Change password</h2>
        <form onSubmit={changePassword} className="space-y-3">
          <input
            type="password"
            placeholder="Current password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="password"
            placeholder="New password (min 8 chars)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {passwordMsg && <p className="text-sm text-muted-foreground">{passwordMsg}</p>}
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Change password
          </button>
        </form>
      </section>
    </div>
  )
}
