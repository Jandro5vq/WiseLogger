import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await getSession()
  if (!session || session.user.role !== 'admin') redirect('/dashboard')

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Admin</h1>

      <div className="grid grid-cols-2 gap-4">
        <Link
          href="/admin/users"
          className="rounded-lg border border-border bg-card p-6 hover:bg-accent transition-colors"
        >
          <div className="text-2xl mb-2">👤</div>
          <h2 className="font-semibold">Users</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage accounts and access</p>
        </Link>

        <Link
          href="/admin/invitations"
          className="rounded-lg border border-border bg-card p-6 hover:bg-accent transition-colors"
        >
          <div className="text-2xl mb-2">✉️</div>
          <h2 className="font-semibold">Invitations</h2>
          <p className="text-sm text-muted-foreground mt-1">Create and manage invite links</p>
        </Link>
      </div>
    </div>
  )
}
