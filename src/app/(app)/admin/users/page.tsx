'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftBox } from 'pixelarticons/react'

interface UserRow {
  id: string
  username: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
  deletedAt: string | null
  purgeAt: string | null
}

interface ResetLink {
  url: string
  expiresAt: string
}

const DAY_MS = 24 * 60 * 60 * 1000

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
}

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<UserRow[]>([])
  const [meId, setMeId] = useState<string | null>(null)
  const [pendingResets, setPendingResets] = useState<Record<string, string>>({})
  const [resetLinks, setResetLinks] = useState<Record<string, ResetLink>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [onboardingResetMsg, setOnboardingResetMsg] = useState<Record<string, string>>({})
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<{ id: string; username: string; email: string } | null>(null)
  const [saving, setSaving] = useState(false)

  function loadUsers() {
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then(setUsers)
      .catch(() => {})
  }

  function loadPendingResets() {
    fetch('/api/admin/password-requests')
      .then((r) => r.json())
      .then((rows: { userId: string; requestedAt: string }[]) =>
        setPendingResets(Object.fromEntries(rows.map((r) => [r.userId, r.requestedAt]))),
      )
      .catch(() => {})
  }

  useEffect(() => {
    loadUsers()
    loadPendingResets()
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((me) => setMeId(me.id ?? null))
      .catch(() => {})
  }, [])

  function setError(id: string, msg: string) {
    setRowError((prev) => ({ ...prev, [id]: msg }))
  }

  async function toggleActive(id: string, current: boolean) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !current }),
    })
    const data = await res.json()
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, isActive: data.isActive } : u)))
    } else {
      setError(id, data.error ?? 'Error')
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    const res = await fetch(`/api/admin/users/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: editing.username, email: editing.email }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(editing.id, data.error ?? 'Error')
      return
    }
    setUsers((prev) => prev.map((u) => (u.id === data.id ? { ...u, username: data.username, email: data.email } : u)))
    setError(editing.id, '')
    setEditing(null)
  }

  async function resetOnboarding(id: string) {
    const res = await fetch(`/api/admin/users/${id}/reset-onboarding`, { method: 'POST' })
    if (res.ok) {
      setOnboardingResetMsg((prev) => ({ ...prev, [id]: 'Tutorial reactivado' }))
    }
  }

  async function generateResetLink(id: string) {
    const res = await fetch(`/api/admin/users/${id}/reset-link`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      setError(id, data.error ?? 'Error')
      return
    }
    setResetLinks((prev) => ({ ...prev, [id]: data }))
    setPendingResets((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function copyLink(id: string, url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(id)
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000)
    } catch {
      // Clipboard unavailable (e.g. plain http): the link stays selectable
    }
  }

  async function deleteUser(user: UserRow) {
    if (!confirm(`¿Eliminar a ${user.username}? No podrá iniciar sesión. Podrás restaurarlo durante 30 días; después se borrará definitivamente con todos sus datos.`)) return
    const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      setError(user.id, data.error ?? 'Error')
      return
    }
    loadUsers()
  }

  async function restoreUser(id: string) {
    const res = await fetch(`/api/admin/users/${id}/restore`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      setError(id, data.error ?? 'Error')
      return
    }
    loadUsers()
  }

  const liveUsers = users.filter((u) => !u.deletedAt)
  const deletedUsers = users.filter((u) => u.deletedAt)
  const pendingCount = liveUsers.filter((u) => pendingResets[u.id]).length

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ArrowLeftBox width={20} height={20} />
          Back
        </button>
        <h1 className="text-2xl font-bold">Users</h1>
      </div>

      {pendingCount > 0 && (
        <p role="status" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {pendingCount === 1 ? '1 usuario ha pedido' : `${pendingCount} usuarios han pedido`} restablecer su contraseña.
          Genera el enlace con «Reset link» y pásaselo.
        </p>
      )}

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
            {liveUsers.map((user) => (
              <tr key={user.id} className="border-t border-border align-top">
                <td className="p-3">
                  {editing?.id === user.id ? (
                    <form id={`edit-${user.id}`} onSubmit={saveEdit} className="space-y-1.5">
                      <input
                        aria-label="Usuario"
                        required
                        minLength={3}
                        maxLength={30}
                        value={editing.username}
                        onChange={(e) => setEditing({ ...editing, username: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <input
                        aria-label="Email"
                        type="email"
                        required
                        value={editing.email}
                        onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </form>
                  ) : (
                    <>
                      <p className="font-medium">{user.username}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </>
                  )}
                  {pendingResets[user.id] && (
                    <span className="mt-1 inline-block text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                      Pide reset · {formatDateTime(pendingResets[user.id])}
                    </span>
                  )}
                </td>
                <td className="p-3 capitalize">{user.role}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${user.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'}`}>
                    {user.isActive ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {editing?.id === user.id ? (
                      <>
                        <button
                          type="submit"
                          form={`edit-${user.id}`}
                          disabled={saving}
                          className="text-xs underline text-foreground disabled:opacity-50"
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => { setEditing(null); setError(user.id, '') }}
                          className="text-xs underline text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => { setEditing({ id: user.id, username: user.username, email: user.email }); setError(user.id, '') }}
                        className="text-xs underline text-muted-foreground hover:text-foreground"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => toggleActive(user.id, user.isActive)}
                      className="text-xs underline text-muted-foreground hover:text-foreground"
                    >
                      {user.isActive ? 'Suspend' : 'Activate'}
                    </button>
                    <button
                      onClick={() => generateResetLink(user.id)}
                      className="text-xs underline text-muted-foreground hover:text-foreground"
                    >
                      Reset link
                    </button>
                    <button
                      onClick={() => resetOnboarding(user.id)}
                      className="text-xs underline text-muted-foreground hover:text-foreground"
                    >
                      Reset tutorial
                    </button>
                    {onboardingResetMsg[user.id] && (
                      <span className="text-xs text-muted-foreground">
                        {onboardingResetMsg[user.id]}
                      </span>
                    )}
                    {user.id !== meId && (
                      <button
                        onClick={() => deleteUser(user)}
                        className="text-xs underline text-destructive hover:opacity-80"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  {resetLinks[user.id] && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate text-xs bg-muted px-1.5 py-0.5 rounded select-all" title={resetLinks[user.id].url}>
                          {resetLinks[user.id].url}
                        </code>
                        <button
                          onClick={() => copyLink(user.id, resetLinks[user.id].url)}
                          className="shrink-0 text-xs underline text-muted-foreground hover:text-foreground"
                        >
                          {copied === user.id ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Un solo uso · caduca el {formatDateTime(resetLinks[user.id].expiresAt)}
                      </p>
                    </div>
                  )}
                  {rowError[user.id] && <p className="mt-1 text-xs text-destructive">{rowError[user.id]}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deletedUsers.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-1">Eliminados</h2>
          <p className="text-sm text-muted-foreground mb-3">
            No pueden iniciar sesión. Se pueden restaurar hasta que se borren definitivamente.
          </p>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {deletedUsers.map((user) => {
                  const daysLeft = user.purgeAt
                    ? Math.max(0, Math.ceil((new Date(user.purgeAt).getTime() - Date.now()) / DAY_MS))
                    : 0
                  return (
                    <tr key={user.id} className="border-t border-border first:border-t-0 align-top">
                      <td className="p-3">
                        <p className="font-medium text-muted-foreground">{user.username}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {daysLeft === 1 ? 'Se borra en 1 día' : `Se borra en ${daysLeft} días`}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => restoreUser(user.id)}
                          className="text-xs underline text-muted-foreground hover:text-foreground"
                        >
                          Restore
                        </button>
                        {rowError[user.id] && <p className="mt-1 text-xs text-destructive">{rowError[user.id]}</p>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
