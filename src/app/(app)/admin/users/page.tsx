'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeftBox } from 'pixelarticons/react'
import { Dialog } from '@/components/ui/dialog'

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
  username: string
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
  const [resetLink, setResetLink] = useState<ResetLink | null>(null)
  const [copied, setCopied] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
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

  async function generateResetLink(user: UserRow) {
    const res = await fetch(`/api/admin/users/${user.id}/reset-link`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      setError(user.id, data.error ?? 'Error')
      return
    }
    setCopied(false)
    setResetLink({ username: user.username, url: data.url, expiresAt: data.expiresAt })
    setPendingResets((prev) => {
      const next = { ...prev }
      delete next[user.id]
      return next
    })
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable (e.g. plain http): the link stays selectable
    }
  }

  function askDelete(user: UserRow) {
    setDeleteError('')
    setDeleteTarget(user)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await fetch(`/api/admin/users/${deleteTarget.id}`, { method: 'DELETE' })
    const data = await res.json()
    setDeleting(false)
    if (!res.ok) {
      setDeleteError(data.error ?? 'Error')
      return
    }
    setDeleteTarget(null)
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

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
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
                      onClick={() => generateResetLink(user)}
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
                        onClick={() => askDelete(user)}
                        className="text-xs underline text-destructive hover:opacity-80"
                      >
                        Delete
                      </button>
                    )}
                  </div>
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

      <Dialog open={!!resetLink} onClose={() => setResetLink(null)} title="Enlace para restablecer contraseña">
        {resetLink && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Pásale este enlace a <strong className="text-foreground">{resetLink.username}</strong>. Sirve una sola vez
              y caduca el {formatDateTime(resetLink.expiresAt)}. No se podrá volver a ver: si se pierde, genera otro.
            </p>
            <code className="block break-all rounded-md bg-muted px-3 py-2 text-xs select-all">{resetLink.url}</code>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setResetLink(null)}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
              >
                Cerrar
              </button>
              <button
                onClick={() => copyLink(resetLink.url)}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {copied ? 'Copiado' : 'Copiar enlace'}
              </button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => !deleting && setDeleteTarget(null)} title="Eliminar usuario">
        {deleteTarget && (
          <div className="space-y-3">
            <p className="text-sm">
              ¿Eliminar a <strong>{deleteTarget.username}</strong> <span className="text-muted-foreground">({deleteTarget.email})</span>?
            </p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              <li>No podrá iniciar sesión y se cerrarán sus sesiones abiertas.</li>
              <li>Podrás restaurarlo desde «Eliminados» durante 30 días.</li>
              <li>Pasado ese plazo se borrará definitivamente con todos sus datos.</li>
            </ul>
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
