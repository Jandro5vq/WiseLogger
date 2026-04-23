import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { Sidebar } from '@/components/layout/sidebar'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { KeyboardShortcuts } from '@/components/layout/keyboard-shortcuts'
import { OnboardingProvider } from '@/components/onboarding/onboarding-provider'
import { Toaster } from '@/components/ui/toast'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <Toaster>
      <div className="flex h-screen overflow-hidden">
        <Sidebar isAdmin={session.user.role === 'admin'} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between border-b border-border px-6 py-3 bg-card">
            <span className="text-sm text-muted-foreground">
              {session.user.username}
            </span>
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
        <KeyboardShortcuts />
        <OnboardingProvider
          userId={session.user.id}
          username={session.user.username}
          onboardingResetAt={session.user.onboardingResetAt}
        />
      </div>
    </Toaster>
  )
}
