import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { Sidebar } from '@/components/layout/sidebar'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { KeyboardShortcuts } from '@/components/layout/keyboard-shortcuts'
import { LiveRefresh } from '@/components/layout/live-refresh'
import { OnboardingProvider } from '@/components/onboarding/onboarding-provider'
import { Toaster } from '@/components/ui/toast'
import { SeasonalDecoration } from '@/components/layout/seasonal-decoration'
import { getSeasonalThemeSettings } from '@/lib/db/queries/instance-settings'
import { resolveSeasonalTheme } from '@/lib/seasonal-theme'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  const seasonalTheme = resolveSeasonalTheme(getSeasonalThemeSettings())

  return (
    <Toaster>
      <div className="flex h-screen overflow-hidden">
        <Sidebar isAdmin={session.user.role === 'admin'} seasonalTheme={seasonalTheme} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="relative flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-3 bg-card">
            <span className="relative z-10 min-w-0 truncate text-sm text-muted-foreground" title={session.user.username}>
              {session.user.username}
            </span>
            <SeasonalDecoration theme={seasonalTheme} placement="header" />
            <div className="relative z-10 shrink-0">
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
        <KeyboardShortcuts />
        <LiveRefresh />
        <OnboardingProvider
          userId={session.user.id}
          username={session.user.username}
          onboardingResetAt={session.user.onboardingResetAt}
        />
      </div>
    </Toaster>
  )
}
