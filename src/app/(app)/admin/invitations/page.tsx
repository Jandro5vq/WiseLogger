'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'pixelarticons/react'

interface Invitation {
  id: string
  token: string
  email: string | null
  createdBy: string
  expiresAt: string
  usedAt: string | null
  registrationUrl?: string
}

export default function AdminInvitationsPage() {
  const router = useRouter()
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [email, setEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [newInvite, setNewInvite] = useState<Invitation | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/admin/invitations')
      .then((r) => r.json())
      .then(setInvitations)
      .catch(() => {})
  }, [])

  async function createInvitation(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    const res = await fetch('/api/admin/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email || undefined }),
    })
    const data = await res.json()
    setCreating(false)
    if (res.ok) {
      setNewInvite(data)
      setInvitations((prev) => [data, ...prev])
      setEmail('')
    }
  }

  async function revokeInvitation(id: string) {
    await fetch(`/api/admin/invitations/${id}`, { method: 'DELETE' })
    setInvitations((prev) =>
      prev.map((i) => (i.id === id ? { ...i, usedAt: new Date().toISOString() } : i))
    )
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft width={18} height={18} />
          Back
        </button>
        <h1 className="text-2xl font-bold">Invitations</h1>
      </div>

      <form onSubmit={createInvitation} className="rounded-lg border border-border bg-card p-4 mb-6 flex gap-3">
        <input
          type="email"
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create invitation'}
        </button>
      </form>

      {newInvite?.registrationUrl && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 mb-4">
          <p className="text-sm font-medium mb-2">New invitation link:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-background rounded px-2 py-1 break-all">
              {newInvite.registrationUrl}
            </code>
            <button
              onClick={() => copyUrl(newInvite.registrationUrl!)}
              className="text-xs rounded-md border border-border px-2 py-1 hover:bg-accent"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Email</th>
              <th className="text-left p-3 font-medium">Expires</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((inv) => (
              <tr key={inv.id} className="border-t border-border">
                <td className="p-3 text-muted-foreground">{inv.email ?? '—'}</td>
                <td className="p-3 text-xs">{new Date(inv.expiresAt).toLocaleDateString()}</td>
                <td className="p-3">
                  {inv.usedAt ? (
                    <span className="text-xs text-muted-foreground">Used/revoked</span>
                  ) : new Date(inv.expiresAt) < new Date() ? (
                    <span className="text-xs text-muted-foreground">Expired</span>
                  ) : (
                    <span className="text-xs text-green-600 dark:text-green-400">Active</span>
                  )}
                </td>
                <td className="p-3">
                  {!inv.usedAt && new Date(inv.expiresAt) >= new Date() && (
                    <button
                      onClick={() => revokeInvitation(inv.id)}
                      className="text-xs underline text-muted-foreground hover:text-destructive"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
