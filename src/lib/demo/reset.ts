import { v4 as uuidv4 } from 'uuid'
import { db, sqlite } from '@/lib/db'
import { entries, tasks, entryBreaks, workScheduleRules, breakRules } from '@db/schema'
import { eq } from 'drizzle-orm'

interface TaskDef {
  description: string
  tags: string[]
  minutes: number
}

interface BreakWindow {
  start: Date
  end: Date
}

function getBreakWindows(dateStr: string): BreakWindow[] {
  return [
    { start: new Date(`${dateStr}T11:00:00.000Z`), end: new Date(`${dateStr}T11:15:00.000Z`) },
    { start: new Date(`${dateStr}T14:00:00.000Z`), end: new Date(`${dateStr}T15:00:00.000Z`) },
  ]
}

// If cursor falls inside a break, advance to the break's end
function skipPastBreaks(cursor: Date, windows: BreakWindow[]): Date {
  let t = cursor
  let moved = true
  while (moved) {
    moved = false
    for (const w of windows) {
      if (t >= w.start && t < w.end) {
        t = w.end
        moved = true
      }
    }
  }
  return t
}

interface BuiltTask {
  id: string
  startTime: Date
  endTime: Date
  description: string
  tags: string[]
}

// Places theme tasks back-to-back, splitting at break boundaries so no task
// ever overlaps with a break window. The last task absorbs remaining work minutes.
function buildTasks(
  theme: TaskDef[],
  entryStart: Date,
  expectedMinutes: number,
  dateStr: string
): BuiltTask[] {
  const windows = getBreakWindows(dateStr)
  const result: BuiltTask[] = []
  let cursor = skipPastBreaks(entryStart, windows)
  let workPlaced = 0
  let themeIdx = 0
  let remainingInTask = theme[0].minutes

  while (themeIdx < theme.length) {
    const isLast = themeIdx === theme.length - 1
    if (isLast) {
      remainingInTask = Math.max(15, expectedMinutes - workPlaced)
    }

    cursor = skipPastBreaks(cursor, windows)
    const taskStart = cursor

    const nextBreak = windows
      .filter(w => w.start > cursor)
      .sort((a, b) => a.start.getTime() - b.start.getTime())[0]

    let taskEnd: Date
    let advanceTheme = true

    if (nextBreak) {
      const minsUntilBreak = (nextBreak.start.getTime() - cursor.getTime()) / 60000
      if (remainingInTask > minsUntilBreak) {
        // Task crosses into the break: place up to break start, resume after
        taskEnd = nextBreak.start
        workPlaced += minsUntilBreak
        remainingInTask -= minsUntilBreak
        cursor = nextBreak.end
        advanceTheme = false
      } else {
        taskEnd = new Date(cursor.getTime() + remainingInTask * 60000)
        workPlaced += remainingInTask
        cursor = taskEnd
      }
    } else {
      taskEnd = new Date(cursor.getTime() + remainingInTask * 60000)
      workPlaced += remainingInTask
      cursor = taskEnd
    }

    result.push({ id: uuidv4(), startTime: taskStart, endTime: taskEnd, description: theme[themeIdx].description, tags: theme[themeIdx].tags })

    if (advanceTheme) {
      themeIdx++
      if (themeIdx < theme.length) {
        remainingInTask = theme[themeIdx].minutes
      }
    }
  }

  return result
}

const THEMES: TaskDef[][] = [
  // Theme A — Backend
  [
    { description: 'Implementar endpoint REST para exportación de informes PDF', tags: ['backend', 'api'], minutes: 120 },
    { description: 'Revisión de código PR #47 — refactorización de capa de datos', tags: ['review', 'backend'], minutes: 45 },
    { description: 'Corrección bug: desbordamiento de sesión en middleware de auth', tags: ['bugfix', 'backend'], minutes: 90 },
    { description: 'Reunión de equipo — planificación sprint 12', tags: ['meeting'], minutes: 30 },
    { description: 'Documentar API endpoints en Swagger/OpenAPI', tags: ['docs', 'api'], minutes: 0 }, // last: fills remaining
  ],
  // Theme B — Frontend
  [
    { description: 'Maquetación componente de dashboard de métricas', tags: ['frontend', 'ui'], minutes: 90 },
    { description: 'Integración API: pantalla de listado de tareas con paginación', tags: ['frontend', 'api'], minutes: 105 },
    { description: 'Corrección estilos en vista móvil del calendario', tags: ['frontend', 'bugfix'], minutes: 45 },
    { description: 'Reunión con diseño — revisión de wireframes v2', tags: ['meeting', 'design'], minutes: 60 },
    { description: 'Pruebas manuales del flujo de registro de usuarios', tags: ['frontend', 'qa'], minutes: 0 }, // last
  ],
  // Theme C — DevOps
  [
    { description: 'Configurar pipeline CI/CD en GitHub Actions', tags: ['devops', 'infra'], minutes: 120 },
    { description: 'Actualizar Dockerfile: migrar a Node 20 Alpine', tags: ['devops'], minutes: 45 },
    { description: 'Revisión de alertas de monitorización — falsos positivos', tags: ['devops', 'ops'], minutes: 30 },
    { description: 'Reunión daily de sincronización', tags: ['meeting'], minutes: 15 },
    { description: 'Análisis de logs de producción semana anterior', tags: ['ops', 'research'], minutes: 0 }, // last
  ],
  // Theme D — Planning/Meetings
  [
    { description: 'Reunión con cliente — presentación de avances Q2', tags: ['meeting', 'client'], minutes: 90 },
    { description: 'Preparación materiales demo para stakeholders', tags: ['docs', 'client'], minutes: 75 },
    { description: 'Retrospectiva de sprint 11', tags: ['meeting'], minutes: 60 },
    { description: 'Actualización roadmap y backlog', tags: ['planning'], minutes: 45 },
    { description: 'Lectura documentación técnica nueva librería de gráficos', tags: ['research'], minutes: 0 }, // last
  ],
  // Theme E — QA/Mixed
  [
    { description: 'Escritura de tests de integración para módulo de pagos', tags: ['qa', 'backend'], minutes: 110 },
    { description: 'Corrección bug: zona horaria incorrecta en exportación CSV', tags: ['bugfix', 'backend'], minutes: 60 },
    { description: 'Revisión de dependencias desactualizadas — npm audit', tags: ['devops', 'maintenance'], minutes: 30 },
    { description: 'Pair programming con Alba — feature de notificaciones', tags: ['backend', 'pair'], minutes: 90 },
    { description: 'Limpieza de deuda técnica: eliminar código muerto en utils', tags: ['maintenance'], minutes: 0 }, // last
  ],
]

const ENTRY_NOTES = [
  'Buen día de trabajo, cerré todas las tareas del sprint',
  'Algo interrumpido por reuniones, pero avancé bien en backend',
  'Día pesado de revisiones, pendiente follow-up con el cliente',
  'Mañana productiva, tarde más dispersa',
  null,
  'Completé el pipeline CI, ya corre en verde',
  'Día de pair programming muy útil',
  null,
  'Reunión de planificación larga, pero quedó claro el roadmap',
  'Cerré 3 bugs en producción — bien',
]

function workdaysBack(count: number): string[] {
  const result: string[] = []
  const cursor = new Date()
  cursor.setUTCHours(0, 0, 0, 0)

  while (result.length < count) {
    const dow = cursor.getUTCDay() // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) {
      const yyyy = cursor.getUTCFullYear()
      const mm = String(cursor.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(cursor.getUTCDate()).padStart(2, '0')
      result.unshift(`${yyyy}-${mm}-${dd}`)
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  return result
}

export function resetDemoData(userId: string): void {
  const doReset = (sqlite as unknown as { transaction: (fn: () => void) => () => void }).transaction(() => {
    // Phase 1: delete all existing data
    db.delete(workScheduleRules).where(eq(workScheduleRules.userId, userId)).run()
    db.delete(breakRules).where(eq(breakRules.userId, userId)).run()
    db.delete(entries).where(eq(entries.userId, userId)).run()
    // tasks and entryBreaks cascade from entries

    // Phase 2: re-seed schedule rules
    db.insert(workScheduleRules).values([
      { id: uuidv4(), userId, ruleType: 'default', weekday: null, month: null, specificDate: null, durationMinutes: 495, label: 'Jornada estándar' },
      { id: uuidv4(), userId, ruleType: 'weekday', weekday: 5, month: null, specificDate: null, durationMinutes: 375, label: 'Viernes intensivo' },
      { id: uuidv4(), userId, ruleType: 'month', weekday: null, month: 8, specificDate: null, durationMinutes: 420, label: 'Horario de verano' },
    ]).run()

    // Phase 2: re-seed break rules
    db.insert(breakRules).values([
      { id: uuidv4(), userId, ruleType: 'always', scheduleDuration: null, weekday: null, breakStart: '14:00', durationMinutes: 60, label: 'Almuerzo' },
      { id: uuidv4(), userId, ruleType: 'always', scheduleDuration: null, weekday: null, breakStart: '11:00', durationMinutes: 15, label: 'Café' },
    ]).run()

    // Phase 3: re-seed entries, tasks, and breaks
    const workdays = workdaysBack(10)

    workdays.forEach((dateStr, dayIndex) => {
      const isoDate = new Date(dateStr + 'T00:00:00.000Z')
      const dow = isoDate.getUTCDay() // 0=Sun...6=Sat
      const isFriday = dow === 5
      const expectedMinutes = isFriday ? 375 : 495

      const entryId = uuidv4()
      const entryStart = new Date(dateStr + 'T08:45:00.000Z')

      const theme = THEMES[dayIndex % 5]
      const builtTasks = buildTasks(theme, entryStart, expectedMinutes, dateStr)
      const entryEnd = builtTasks[builtTasks.length - 1].endTime

      db.insert(entries).values({
        id: entryId,
        userId,
        date: dateStr,
        startTime: entryStart.toISOString(),
        endTime: entryEnd.toISOString(),
        expectedMinutes,
        notes: ENTRY_NOTES[dayIndex] ?? null,
      }).run()

      for (const t of builtTasks) {
        db.insert(tasks).values({
          id: t.id,
          entryId,
          userId,
          startTime: t.startTime.toISOString(),
          endTime: t.endTime.toISOString(),
          description: t.description,
          tags: JSON.stringify(t.tags),
        }).run()
      }

      // Lunch and coffee breaks
      db.insert(entryBreaks).values([
        {
          id: uuidv4(),
          entryId,
          userId,
          breakStart: dateStr + 'T11:00:00.000Z',
          durationMinutes: 15,
          label: 'Café',
          fromRuleId: null,
        },
        {
          id: uuidv4(),
          entryId,
          userId,
          breakStart: dateStr + 'T14:00:00.000Z',
          durationMinutes: 60,
          label: 'Almuerzo',
          fromRuleId: null,
        },
      ]).run()
    })
  })

  doReset()
}
