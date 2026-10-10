import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'

export default async function AdminAppearanceLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session || session.user.role !== 'admin') redirect('/dashboard')
  return children
}
