'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Clock, Calendar, ChartBarBig, Settings2, User, Logout } from 'pixelarticons/react'

const navItems = [
  { href: '/dashboard', label: 'Hoy', Icon: Clock },
  { href: '/history', label: 'Historial', Icon: Calendar },
  { href: '/stats', label: 'Estadísticas', Icon: ChartBarBig },
  { href: '/settings', label: 'Ajustes', Icon: Settings2 },
]

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <aside className="flex flex-col h-full w-56 bg-card border-r border-border px-3 py-4">
      <div className="mb-6 px-2">
        <span className="text-xl font-bold text-primary">WiseLogger</span>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              pathname === item.href || pathname.startsWith(item.href + '/')
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <item.Icon width={20} height={20} />
            {item.label}
          </Link>
        ))}

        {isAdmin && (
          <Link
            href="/admin"
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              pathname.startsWith('/admin')
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <User width={20} height={20} />
            Admin
          </Link>
        )}
      </nav>

      <button
        onClick={handleLogout}
        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <Logout width={20} height={20} />
        Cerrar sesión
      </button>
    </aside>
  )
}
