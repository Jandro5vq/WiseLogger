'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftBox } from 'pixelarticons/react'
import { useToast } from '@/components/ui/toast'
import { getJson } from '@/lib/fetcher'
import { SeasonalDecoration } from '@/components/layout/seasonal-decoration'
import { MANUAL_SEASONAL_THEMES, SEASONAL_CALENDAR, SEASONAL_THEME_LABELS } from '@/lib/seasonal-theme'
import type { ActiveSeasonalTheme, ManualSeasonalTheme, SeasonalThemeMode } from '@/lib/seasonal-theme'

interface SeasonalThemeResponse {
  seasonalThemeMode: SeasonalThemeMode
  manualSeasonalTheme: ManualSeasonalTheme | null
  manualSeasonalThemeUntil: string | null
  activeTheme: ActiveSeasonalTheme
}

function localInputValue(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

export default function AdminAppearancePage() {
  const router = useRouter()
  const toast = useToast()
  const [settings, setSettings] = useState<SeasonalThemeResponse | null>(null)
  const [mode, setMode] = useState<SeasonalThemeMode>('automatic')
  const [theme, setTheme] = useState<ManualSeasonalTheme>('winter')
  const [until, setUntil] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getJson<SeasonalThemeResponse>('/api/admin/seasonal-theme')
      .then((data) => {
        setSettings(data)
        setMode(data.seasonalThemeMode === 'manual' &&
          (!data.manualSeasonalThemeUntil || new Date(data.manualSeasonalThemeUntil).getTime() <= Date.now())
          ? 'automatic' : data.seasonalThemeMode)
        if (data.manualSeasonalTheme) setTheme(data.manualSeasonalTheme)
        setUntil(localInputValue(data.manualSeasonalThemeUntil))
      })
      .catch(() => toast.error('No se pudo cargar la apariencia estacional'))
  }, [toast])

  async function save() {
    if (mode === 'manual' && !until) {
      toast.error('Indica cuándo termina la decoración manual')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/seasonal-theme', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonalThemeMode: mode,
          manualSeasonalTheme: mode === 'manual' ? theme : null,
          manualSeasonalThemeUntil: mode === 'manual' ? new Date(until).toISOString() : null,
        }),
      })
      const data = await res.json() as SeasonalThemeResponse | { error: string }
      if (!res.ok || 'error' in data) {
        toast.error('error' in data ? data.error : 'No se pudo guardar')
        return
      }
      setSettings(data)
      toast.success('Apariencia estacional guardada')
      router.refresh()
    } catch {
      toast.error('No se pudo guardar. Comprueba la conexión e inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const activeLabel = settings && settings.activeTheme !== 'none' ? SEASONAL_THEME_LABELS[settings.activeTheme] : 'Sin decoración'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ArrowLeftBox width={20} height={20} />
          Volver
        </button>
        <h1 className="text-2xl font-bold">Apariencia estacional</h1>
      </div>

      <section className="rounded-lg border border-border bg-card p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Decoraciones de temporada</h2>
          <p className="mt-1 text-sm text-muted-foreground">Añade detalles discretos en la cabecera y la barra lateral para toda la instancia.</p>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Modo</legend>
          {([
            ['disabled', 'Desactivado', 'No se muestran decoraciones.'],
            ['automatic', 'Automático', 'Activa cada decoración en las fechas del calendario de abajo (hora peninsular).'],
            ['manual', 'Manual temporal', 'Muestra una decoración hasta la fecha indicada y después vuelve al modo automático.'],
          ] as const).map(([value, label, description]) => (
            <label key={value} className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="radio" name="seasonal-mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-1 accent-primary" />
              <span><span className="block text-sm font-medium">{label}</span><span className="text-xs text-muted-foreground">{description}</span></span>
            </label>
          ))}
        </fieldset>

        {mode === 'manual' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1"><span className="block text-sm font-medium">Decoración</span>
              <select value={theme} onChange={(event) => setTheme(event.target.value as ManualSeasonalTheme)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {MANUAL_SEASONAL_THEMES.map((value) => <option key={value} value={value}>{SEASONAL_THEME_LABELS[value]}</option>)}
              </select>
            </label>
            <label className="space-y-1"><span className="block text-sm font-medium">Termina el</span>
              <input type="datetime-local" value={until} onChange={(event) => setUntil(event.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              <span className="block text-xs text-muted-foreground">Hora local de este dispositivo.</span>
            </label>
          </div>
        )}

        <div className="rounded-md bg-muted px-3 py-2 text-sm"><span className="text-muted-foreground">Visible ahora: </span><strong>{settings ? activeLabel : 'Cargando…'}</strong></div>
        <button onClick={save} disabled={saving || !settings} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </section>

      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">Vista previa y calendario</h2>
        <p className="text-sm text-muted-foreground">Explora las decoraciones sin activarlas para nadie. En modo manual, la selección también elige la decoración que se guardará.</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Decoración de la vista previa">
          {MANUAL_SEASONAL_THEMES.map((value) => (
            <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)}
              className={`rounded-md border px-3 py-2 text-sm ${theme === value ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-accent'}`}>
              {SEASONAL_THEME_LABELS[value]}
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <div className="relative flex min-h-20 items-center justify-between gap-3 border-b border-border bg-card px-4 py-2">
            <span className="relative z-10 shrink-0 text-xs text-muted-foreground">Cabecera</span>
            <SeasonalDecoration theme={theme} placement="header" preview />
            <span aria-hidden="true" className="relative z-10 shrink-0 text-muted-foreground">☼</span>
          </div>
          <div className="flex items-end justify-between gap-4 p-4">
            <div><p className="text-sm font-medium">{SEASONAL_THEME_LABELS[theme]}</p><p className="mt-1 text-xs text-muted-foreground">{SEASONAL_CALENDAR.find((item) => item.theme === theme)?.details}</p></div>
            <SeasonalDecoration theme={theme} placement="sidebar" preview />
          </div>
        </div>
        <dl className="divide-y divide-border text-sm">
          {SEASONAL_CALENDAR.map((item) => (
            <div key={item.theme} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2">
              <dt className="font-medium">{SEASONAL_THEME_LABELS[item.theme]}</dt>
              <dd className="text-muted-foreground">{item.dates}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">Pasa el cursor sobre los dibujos para ver una animación suave. Se desactiva si prefieres movimiento reducido. Calendario en Europe/Madrid, sin sonido ni cambios de color de la interfaz.</p>
      </section>
    </div>
  )
}
