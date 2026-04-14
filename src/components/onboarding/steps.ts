export type StepPlacement = 'top' | 'bottom' | 'auto' | 'center'

export interface TourStep {
  id: string
  anchor: string | null
  title: string
  body: string
  placement: StepPlacement
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    anchor: null,
    title: 'Bienvenido a WiseLogger',
    body: 'Registra tu jornada con tareas y descansos. Te enseñamos lo básico en unos pocos pasos.',
    placement: 'center',
  },
  {
    id: 'new-task',
    anchor: '[data-tour="new-task"]',
    title: 'Crea tu primera tarea',
    body: 'Escribe qué estás haciendo y pulsa Enter para iniciarla. Atajo: tecla N.',
    placement: 'auto',
  },
  {
    id: 'tasks-panel',
    anchor: '[data-tour="tasks-panel"]',
    title: 'Tus tareas y el cronómetro',
    body: 'Aquí aparecen tus tareas del día y la tarea activa con su cronómetro. Púlsala para editarla o pulsa S para detenerla.',
    placement: 'auto',
  },
  {
    id: 'breaks',
    anchor: '[data-tour="breaks"]',
    title: 'Descansos',
    body: 'Registra pausas del día. El tiempo de descanso se resta del tiempo trabajado al calcular el balance.',
    placement: 'auto',
  },
  {
    id: 'close-day',
    anchor: '[data-tour="close-day"]',
    title: 'Cerrar la jornada',
    body: 'Al terminar, cierra el día con este botón (atajo: C). Se calculará tu balance respecto a las horas esperadas.',
    placement: 'auto',
  },
  {
    id: 'settings-link',
    anchor: '[data-tour="settings-link"]',
    title: 'Configura tu horario',
    body: 'En Ajustes defines tus reglas de horario y descansos. Estas reglas determinan las horas esperadas y tu balance diario.',
    placement: 'auto',
  },
]
