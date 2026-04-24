/**
 * All user-facing strings for the onboarding tour live here.
 * Currently only Spanish; structure leaves room for future i18n
 * without touching the components.
 */

export const MESSAGES = {
  ui: {
    skip: 'Saltar',
    back: 'Atrás',
    next: 'Siguiente',
    finish: 'Finalizar',
    stepLabel: (current: number, total: number) => `Paso ${current} de ${total}`,
    anchorMissingTitle: 'No hemos encontrado esta parte',
    anchorMissingBody: 'Puede que no esté visible en esta pantalla. Pulsa Siguiente para continuar o Saltar para cerrar el tutorial.',
    shortcutPrefix: 'Atajo',
    tutorialLabel: 'Tutorial',
    progressLabel: 'Progreso',
    screenReaderStep: (current: number, total: number, title: string) =>
      `Paso ${current} de ${total}: ${title}`,
  },
  steps: {
    welcome: {
      title: 'Bienvenido a WiseLogger',
      body: 'Registra tu jornada con tareas y descansos. Te enseñamos lo básico y los atajos clave en unos minutos.',
    },
    'new-task': {
      title: 'Crea tu primera tarea',
      body: 'Escribe qué estás haciendo y pulsa Enter para iniciar el cronómetro. Desde cualquier parte de la app puedes abrir este formulario con N.',
    },
    'tasks-panel': {
      title: 'Tus tareas y el cronómetro',
      body: 'Aquí ves las tareas del día y la que está activa. Pulsa una tarjeta para editarla; con S detienes la tarea activa al instante.',
    },
    timeline: {
      title: 'Timeline del día',
      body: 'Un Gantt en vivo de tus tareas y pausas. Cada color es una tarea distinta; las barras grises son descansos.',
    },
    breaks: {
      title: 'Descansos',
      body: 'Registra pausas aquí. El tiempo de descanso se resta del trabajado al calcular tu balance diario, así que no hace falta que pares el cronómetro.',
    },
    notes: {
      title: 'Notas del día',
      body: 'Un bloc rápido por jornada con formato (listas, negritas, enlaces). Los últimos seis días aparecen plegables debajo para consulta rápida.',
    },
    'close-day': {
      title: 'Cerrar la jornada',
      body: 'Cuando termines, cierra el día con este botón. Se calcula tu balance respecto a las horas esperadas. Atajo: C.',
    },
    history: {
      title: 'Historial semanal',
      body: 'Navega por semanas anteriores. Usa la casilla de la izquierda de cada tarea para marcarla como imputada; si luego la modificas, el check se retira solo y te avisamos.',
    },
    stats: {
      title: 'Estadísticas',
      body: 'Visualiza patrones con el heatmap de actividad, el balance acumulado y las horas por día. Cambia entre Semana, Mes y Año arriba a la derecha.',
    },
    'schedule-rules': {
      title: 'Reglas de horario',
      body: 'Aquí defines cuántas horas se esperan de ti. Puedes mezclar regla por defecto, por día de la semana, por mes o por fecha concreta — se aplica la más específica.',
    },
    appearance: {
      title: 'Apariencia',
      body: 'Elige entre seis colores de acento para personalizar la interfaz. Combínalo con el tema claro u oscuro desde la barra lateral.',
    },
    shortcuts: {
      title: 'Atajos de teclado',
      body: 'Estos atajos están activos en toda la app salvo cuando escribes en un campo. Puedes volver a ver este tutorial desde Ajustes → Rehacer tutorial.',
    },
  },
} as const

export type StepKey = keyof typeof MESSAGES.steps
