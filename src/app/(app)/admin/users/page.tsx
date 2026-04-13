'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'pixelarticons/react'

interface UserRow {
  id: string
  username: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<UserRow[]>([])
  const [resetResult, setResetResult] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then(setUsers)
      .catch(() => {})
  }, [])

  async function toggleActive(id: string, current: boolean) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !current }),
    })
    const data = await res.json()
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, isActive: data.isActive } : u)))
    }
  }

  async function resetPassword(id: string) {
    const res = await fetch(`/api/admin/users/${id}/reset-password`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setResetResult((prev) => ({ ...prev, [id]: data.tempPassword }))
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft width={18} height={18} />
          Back
        </button>
        <h1 className="text-2xl font-bold">Users</h1>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">User</th>
              <th className="text-left p-3 font-medium">Role</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-border">
                <td className="p-3">
                  <p className="font-medium">{user.username}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </td>
                <td className="p-3 capitalize">{user.role}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${user.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'}`}>
                    {user.isActive ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => toggleActive(user.id, user.isActive)}
                      className="text-xs underline text-muted-foreground hover:text-foreground"
                    >
                      {user.isActive ? 'Suspend' : 'Activate'}
                    </button>
                    <button
                      onClick={() => resetPassword(user.id)}
                      className="text-xs underline text-muted-foreground hover:text-foreground"
                    >
                      Reset password
                    </button>
                    {resetResult[user.id] && (
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded select-all">
                        {resetResult[user.id]}
                      </code>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
