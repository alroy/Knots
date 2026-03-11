"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"
import { cn, formatRelativeTime, groupByDate } from "@/lib/utils"
import { ArrowLeft, RotateCcw } from "lucide-react"
import type { Goal } from "@/lib/chief-of-staff-types"
import { PRIORITY_LABELS, PRIORITY_COLORS } from "@/lib/chief-of-staff-types"
import Link from "next/link"

export default function GoalsArchivePage() {
  const { user, loading: authLoading } = useAuth()
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [unarchivingId, setUnarchivingId] = useState<string | null>(null)
  const [enteringIds, setEnteringIds] = useState<Set<string>>(new Set())
  const supabase = createClient()

  useEffect(() => {
    if (user) loadArchivedGoals()
  }, [user])

  const loadArchivedGoals = async () => {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['completed', 'archived'])
        .order('completed_at', { ascending: false, nullsFirst: false })
      if (error) throw error
      setGoals((data || []).map((g: any) => ({
        id: g.id,
        title: g.title,
        description: g.description || '',
        priority: g.priority,
        status: g.status,
        metrics: g.metrics || '',
        deadline: g.deadline,
        risks: g.risks || '',
        position: g.position,
        createdAt: g.created_at,
        completedAt: g.completed_at,
      })))
    } catch (error) {
      console.error('Error loading archived goals:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUnarchive = async (id: string) => {
    // Play slide-out-to-left exit animation (same as backlog → tasks)
    setUnarchivingId(id)

    setTimeout(async () => {
      setUnarchivingId(null)
      setGoals(prev => prev.filter(g => g.id !== id))

      try {
        const { error } = await supabase.from('goals').update({
          status: 'active',
          completed_at: null,
        }).eq('id', id)
        if (error) throw error
      } catch (error) {
        console.error('Error unarchiving goal:', error)
        loadArchivedGoals()
      }
    }, 300)
  }

  if (authLoading || loading) {
    return (
      <main className="min-h-screen bg-background py-8">
        <div className="content-column">
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-background py-8">
        <div className="content-column">
          <p className="text-center text-muted-foreground py-12">Please sign in to view archived goals.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background py-8">
      <div className="content-column">
        <header className="mb-10 md:mb-12">
          <Link
            href="/?tab=goals"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Goals
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Goals Archive</h1>
        </header>

        {goals.length > 0 ? (
          <div className="flex flex-col gap-6">
            {groupByDate(goals).map(({ label, items }) => (
              <div key={label}>
                <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">{label}</h2>
                <div className="flex flex-col gap-3">
                  {items.map((goal) => (
                    <ArchivedGoalCard
                      key={goal.id}
                      goal={goal}
                      isUnarchiving={goal.id === unarchivingId}
                      isEntering={enteringIds.has(goal.id)}
                      onUnarchive={() => handleUnarchive(goal.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-muted-foreground">
            No archived goals yet. Goals you mark as done will appear here.
          </p>
        )}
      </div>
    </main>
  )
}

function ArchivedGoalCard({ goal, isUnarchiving, isEntering, onUnarchive }: {
  goal: Goal
  isUnarchiving?: boolean
  isEntering?: boolean
  onUnarchive: () => void
}) {
  return (
    <div
      className={cn(
        "rounded-lg bg-card p-4 transition-[background-color,opacity] duration-200 bg-accent-subtle opacity-75",
        isUnarchiving && "animate-out fade-out slide-out-to-left duration-300 fill-mode-forwards",
        isEntering && "animate-in fade-in slide-in-from-right duration-300",
        !isUnarchiving && !isEntering && "animate-in fade-in duration-300",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Priority badge */}
        <span className={cn(
          "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
          PRIORITY_COLORS[goal.priority]
        )}>
          {PRIORITY_LABELS[goal.priority]}
        </span>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <span className="text-base font-semibold text-muted-foreground line-through decoration-muted-foreground/50">
            {goal.title}
          </span>
          <span className="block text-xs text-muted-foreground">
            {formatRelativeTime(goal.createdAt)}
          </span>
          {goal.description && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{goal.description}</p>
          )}
        </div>

        {/* Unarchive button */}
        <button
          onClick={onUnarchive}
          className="shrink-0 p-1.5 rounded-md text-muted-foreground/50 hover:text-primary transition-colors"
          aria-label="Unarchive goal"
          title="Move back to Goals"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
