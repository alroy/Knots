"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { formatRelativeTime } from '@/lib/utils'

interface PendingUser {
  userId: string
  email: string
  name: string
  avatarUrl: string
  createdAt: string
}

export default function AdminPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [users, setUsers] = useState<PendingUser[]>([])
  const [fetching, setFetching] = useState(true)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [denyingId, setDenyingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'gil.alroy@gmail.com'
  const isAdmin = user?.email?.toLowerCase() === adminEmail.toLowerCase()

  // Redirect non-admin users
  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.replace('/')
    }
  }, [loading, user, isAdmin, router])

  // Fetch pending users
  useEffect(() => {
    if (!isAdmin) return

    fetch('/api/admin/pending-users')
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error)
        } else {
          setUsers(data.users || [])
        }
      })
      .catch(() => setError('Failed to load pending users'))
      .finally(() => setFetching(false))
  }, [isAdmin])

  const handleApprove = async (userId: string) => {
    setApprovingId(userId)
    const prev = [...users]
    setUsers(users.filter(u => u.userId !== userId))

    try {
      const res = await fetch('/api/admin/approve-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setUsers(prev)
        setError(data.error || 'Failed to approve user')
      }
    } catch {
      setUsers(prev)
      setError('Failed to approve user')
    } finally {
      setApprovingId(null)
    }
  }

  const handleDeny = async (userId: string) => {
    setDenyingId(userId)
    const prev = [...users]
    setUsers(users.filter(u => u.userId !== userId))

    try {
      const res = await fetch('/api/admin/deny-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setUsers(prev)
        setError(data.error || 'Failed to deny user')
      }
    } catch {
      setUsers(prev)
      setError('Failed to deny user')
    } finally {
      setDenyingId(null)
    }
  }

  if (loading || !isAdmin) {
    return (
      <main className="min-h-screen bg-background py-12">
        <div className="content-column">
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background py-12">
      <div className="mx-auto max-w-xl px-4">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">User Approvals</h1>
          <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
            Back to app
          </Button>
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-600">{error}</p>
        )}

        {fetching ? (
          <p className="text-muted-foreground">Loading pending users...</p>
        ) : users.length === 0 ? (
          <div className="rounded-lg border border-border bg-accent p-8 text-center">
            <p className="text-muted-foreground">No pending users</p>
          </div>
        ) : (
          <div className="space-y-3">
            {users.map(u => (
              <div
                key={u.userId}
                className="flex items-center gap-4 rounded-lg border border-border bg-accent p-4"
              >
                {u.avatarUrl ? (
                  <img
                    src={u.avatarUrl}
                    alt=""
                    className="h-10 w-10 rounded-full"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                    {(u.name || u.email).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {u.name && (
                    <p className="truncate font-medium text-foreground">{u.name}</p>
                  )}
                  <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeTime(u.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeny(u.userId)}
                    disabled={denyingId === u.userId || approvingId === u.userId}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    {denyingId === u.userId ? 'Denying...' : 'Deny'}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleApprove(u.userId)}
                    disabled={approvingId === u.userId || denyingId === u.userId}
                  >
                    {approvingId === u.userId ? 'Approving...' : 'Approve'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
