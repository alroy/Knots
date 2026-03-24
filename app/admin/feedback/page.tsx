"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { formatRelativeTime } from '@/lib/utils'

interface FeedbackItem {
  id: string
  user_name: string
  user_email: string
  category: string
  subject: string
  description: string
  status: string
  created_at: string
}

const FILTER_OPTIONS = [
  { value: 'bug', label: 'Bugs' },
  { value: 'improvement', label: 'Improvements' },
]

const STATUS_OPTIONS = ['new', 'reviewed', 'planned', 'fixed']

const CATEGORY_STYLES: Record<string, string> = {
  bug: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  feature: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  improvement: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  question: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
}

export default function AdminFeedbackPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [feedback, setFeedback] = useState<FeedbackItem[]>([])
  const [fetching, setFetching] = useState(true)
  const [activeFilter, setActiveFilter] = useState('bug')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'gil.alroy@gmail.com'
  const isAdmin = user?.email?.toLowerCase() === adminEmail.toLowerCase()

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.replace('/')
    }
  }, [loading, user, isAdmin, router])

  useEffect(() => {
    if (!isAdmin) return
    fetchFeedback()
  }, [isAdmin, activeFilter])

  const fetchFeedback = async () => {
    setFetching(true)
    try {
      const params = new URLSearchParams()
      params.set('category', activeFilter)
      const res = await fetch(`/api/admin/feedback?${params}`)
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setFeedback(data.feedback || [])
      }
    } catch {
      setError('Failed to load feedback')
    } finally {
      setFetching(false)
    }
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    setUpdatingId(id)
    const prev = [...feedback]
    setFeedback(feedback.map(f => f.id === id ? { ...f, status: newStatus } : f))

    try {
      const res = await fetch('/api/admin/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setFeedback(prev)
        setError(data.error || 'Failed to update status')
      }
    } catch {
      setFeedback(prev)
      setError('Failed to update status')
    } finally {
      setUpdatingId(null)
    }
  }

  if (loading || !isAdmin) {
    return (
      <main className="min-h-screen bg-background py-12">
        <div className="mx-auto max-w-xl px-4">
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
          <h1 className="text-2xl font-bold text-foreground">Feedback</h1>
          <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
            Back to app
          </Button>
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setActiveFilter(opt.value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                activeFilter === opt.value
                  ? 'bg-foreground text-background'
                  : 'bg-accent text-foreground hover:bg-accent-hover'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="mb-4 text-sm text-red-600">{error}</p>
        )}

        {fetching ? (
          <p className="text-muted-foreground">Loading feedback...</p>
        ) : feedback.length === 0 ? (
          <div className="rounded-lg border border-border bg-accent p-8 text-center">
            <p className="text-muted-foreground">No feedback yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {feedback.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border bg-accent p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_STYLES[item.category] || CATEGORY_STYLES.other}`}>
                        {item.category}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(item.created_at)}
                      </span>
                    </div>
                    <p className="font-medium text-foreground">{item.subject}</p>
                  </div>
                  <select
                    value={item.status}
                    onChange={(e) => handleStatusChange(item.id, e.target.value)}
                    disabled={updatingId === item.id}
                    className="shrink-0 rounded-md border border-border/60 bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                {item.description && (
                  <p className="text-sm text-muted-foreground mb-2 line-clamp-3">
                    {item.description}
                  </p>
                )}

                <div className="text-xs text-muted-foreground">
                  {item.user_name && <span className="font-medium">{item.user_name}</span>}
                  {item.user_name && item.user_email && <span> · </span>}
                  {item.user_email && <span>{item.user_email}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
