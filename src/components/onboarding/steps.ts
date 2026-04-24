import { MESSAGES, type StepKey } from './messages'

export type StepPlacement = 'top' | 'bottom' | 'auto' | 'center'
export type TourRoute = '/dashboard' | '/history' | '/stats' | '/settings'

export interface TourStep {
  id: StepKey
  anchor: string | null
  route: TourRoute
  placement: StepPlacement
  /** Optional single-key shortcut, rendered as a <kbd> chip. */
  shortcut?: string
  /** If true, the final step renders the keyboard shortcut cheat sheet. */
  kind?: 'default' | 'shortcuts-cheatsheet'
}

export const TOUR_STEPS: TourStep[] = [
  { id: 'welcome',         anchor: null,                       route: '/dashboard', placement: 'center' },
  { id: 'new-task',        anchor: '[data-tour="new-task"]',    route: '/dashboard', placement: 'auto', shortcut: 'N' },
  { id: 'tasks-panel',     anchor: '[data-tour="tasks-panel"]', route: '/dashboard', placement: 'auto', shortcut: 'S' },
  { id: 'timeline',        anchor: '[data-tour="timeline"]',    route: '/dashboard', placement: 'auto' },
  { id: 'breaks',          anchor: '[data-tour="breaks"]',      route: '/dashboard', placement: 'auto' },
  { id: 'notes',           anchor: '[data-tour="daily-notes"]', route: '/dashboard', placement: 'auto' },
  { id: 'close-day',       anchor: '[data-tour="close-day"]',   route: '/dashboard', placement: 'auto', shortcut: 'C' },
  { id: 'history',         anchor: '[data-tour="week-nav"]',    route: '/history',   placement: 'auto' },
  { id: 'stats',           anchor: '[data-tour="stats-main"]',  route: '/stats',     placement: 'auto' },
  { id: 'schedule-rules',  anchor: '[data-tour="schedule-rules"]', route: '/settings', placement: 'auto' },
  { id: 'appearance',      anchor: '[data-tour="appearance"]',  route: '/settings',  placement: 'auto' },
  { id: 'shortcuts',       anchor: null,                        route: '/settings',  placement: 'center', kind: 'shortcuts-cheatsheet' },
]

export function stepTitle(step: TourStep): string {
  return MESSAGES.steps[step.id].title
}

export function stepBody(step: TourStep): string {
  return MESSAGES.steps[step.id].body
}
