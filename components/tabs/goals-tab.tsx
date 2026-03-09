"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"
import { cn, formatRelativeTime } from "@/lib/utils"
import { Target, Trash2, ChevronDown, ChevronUp, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { Goal } from "@/lib/chief-of-staff-types"
import { PRIORITY_LABELS, PRIORITY_COLORS } from "@/lib/chief-of-staff-types"

/** Returns true when deadline is within 2 days and the goal is not completed. */
function isGoalAtRisk(goal: Goal): boolean {
  if (goal.status === 'completed' || !goal.deadline) return false
  const now = new Date()
  const deadline = new Date(goal.deadline + 'T23:59:59')
  const diffMs = deadline.getTime() - now.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays <= 2
}

/** Returns a date string (YYYY-MM-DD) for 7 days from now. */
function defaultDeadline(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return d.toISOString().slice(0, 10)
}

interface GoalsTabProps {
  contentColumnRef: React.RefObject<HTMLDivElement | null>
}

export function GoalsTab({ contentColumnRef }: GoalsTabProps) {
  const { user } = useAuth()
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editGoal, setEditGoal] = useState<Goal | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({})
  const supabase = createClient()

  useEffect(() => {
    if (user) {
      loadGoals()
      loadTaskCounts()
    }
  }, [user])

  // Real-time subscription
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('goals-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals', filter: `user_id=eq.${user.id}` }, () => {
        loadGoals()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  const loadTaskCounts = async () => {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('goal_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .not('goal_id', 'is', null)
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const t of data || []) {
        if (t.goal_id) counts[t.goal_id] = (counts[t.goal_id] || 0) + 1
      }
      setTaskCounts(counts)
    } catch (error) {
      console.error('Error loading task counts:', error)
    }
  }

  const loadGoals = async () => {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .order('position', { ascending: true })
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
      console.error('Error loading goals:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (data: GoalFormData) => {
    if (!user) return
    try {
      const { error } = await supabase.from('goals').insert({
        title: data.title,
        description: data.description,
        priority: data.priority,
        metrics: data.metrics,
        deadline: data.deadline || null,
        risks: data.risks,
        user_id: user.id,
        position: 0,
      })
      if (error) throw error
      loadGoals()
    } catch (error) {
      console.error('Error adding goal:', error)
    }
  }

  const handleUpdate = async (id: string, data: GoalFormData) => {
    try {
      const { error } = await supabase.from('goals').update({
        title: data.title,
        description: data.description,
        priority: data.priority,
        metrics: data.metrics,
        deadline: data.deadline || null,
        risks: data.risks,
      }).eq('id', id)
      if (error) throw error
      loadGoals()
    } catch (error) {
      console.error('Error updating goal:', error)
    }
  }

  const handleDelete = async (id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id))
    try {
      const { error } = await supabase.from('goals').delete().eq('id', id)
      if (error) throw error
    } catch (error) {
      console.error('Error deleting goal:', error)
      loadGoals()
    }
  }

  const handleStatusToggle = async (id: string) => {
    const goal = goals.find(g => g.id === id)
    if (!goal) return
    const nextStatus = goal.status === 'active' ? 'completed' : goal.status === 'completed' ? 'active' : 'active'
    setGoals(prev => prev.map(g => g.id === id ? { ...g, status: nextStatus } : g))
    try {
      const { error } = await supabase.from('goals').update({
        status: nextStatus,
        completed_at: nextStatus === 'completed' ? new Date().toISOString() : null,
      }).eq('id', id)
      if (error) throw error
    } catch (error) {
      console.error('Error toggling goal status:', error)
      loadGoals()
    }
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading goals...</p>
      </div>
    )
  }

  return (
    <>
      <header className="mb-10 md:mb-12">
        <h1 className="mb-2 text-2xl font-bold text-foreground">Goals</h1>
        <p className="text-muted-foreground">What you're accountable for.</p>
      </header>

      {goals.length > 0 ? (
        <div className="flex flex-col gap-3">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              taskCount={taskCounts[goal.id] || 0}
              isExpanded={expandedId === goal.id}
              onToggleExpand={() => setExpandedId(expandedId === goal.id ? null : goal.id)}
              onEdit={() => { setEditGoal(goal); setIsFormOpen(true) }}
              onDelete={() => handleDelete(goal.id)}
              onStatusToggle={() => handleStatusToggle(goal.id)}
            />
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-muted-foreground">
          No goals yet. Add your top priorities to get started.
        </p>
      )}

      {/* FAB */}
      <FAB onClick={() => { setEditGoal(null); setIsFormOpen(true) }} contentColumnRef={contentColumnRef} />

      {/* Form modal */}
      {isFormOpen && (
        <GoalFormModal
          goal={editGoal}
          onSubmit={(data) => {
            if (editGoal) {
              handleUpdate(editGoal.id, data)
            } else {
              handleAdd(data)
            }
            setIsFormOpen(false)
            setEditGoal(null)
          }}
          onClose={() => { setIsFormOpen(false); setEditGoal(null) }}
        />
      )}
    </>
  )
}

// --- Goal Card ---

function GoalCard({ goal, taskCount, isExpanded, onToggleExpand, onEdit, onDelete, onStatusToggle }: {
  goal: Goal
  taskCount: number
  isExpanded: boolean
  onToggleExpand: () => void
  onEdit: () => void
  onDelete: () => void
  onStatusToggle: () => void
}) {
  const isCompleted = goal.status === 'completed'
  const atRisk = isGoalAtRisk(goal)

  return (
    <div
      className={cn(
        "rounded-lg bg-card p-4 transition-[background-color,opacity] duration-200",
        !isCompleted && !atRisk && "hover:bg-accent-hover",
        isCompleted && "bg-accent-subtle opacity-75",
        atRisk && "bg-red-50 dark:bg-red-950/30",
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
        <div className="min-w-0 flex-1 cursor-pointer" onClick={onEdit}>
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-base font-semibold text-foreground",
              isCompleted && "text-muted-foreground line-through decoration-muted-foreground/50"
            )}>
              {goal.title}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {goal.deadline ? `Due ${goal.deadline}` : formatRelativeTime(goal.createdAt)}
            {taskCount > 0 && <> · {taskCount} linked {taskCount === 1 ? 'task' : 'tasks'}</>}
          </span>
          {goal.description && !isExpanded && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{goal.description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onToggleExpand}
            className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground transition-colors"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-1.5 rounded-md text-muted-foreground/50 hover:text-destructive transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            aria-label="Delete goal"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-4 ml-10 space-y-3 text-sm">
          {goal.description && (
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Success Criteria</span>
              <p className="mt-1 text-foreground whitespace-pre-wrap">{goal.description}</p>
            </div>
          )}
          {goal.metrics && (
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Key Metrics</span>
              <p className="mt-1 text-foreground whitespace-pre-wrap">{goal.metrics}</p>
            </div>
          )}
          {goal.risks && (
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Risks & Blockers</span>
              <p className="mt-1 text-foreground whitespace-pre-wrap">{goal.risks}</p>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button size="sm" variant="ghost" onClick={onStatusToggle} className="text-xs h-7">
              {isCompleted ? "Reopen" : "Complete"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// --- FAB ---

function FAB({ onClick, contentColumnRef }: { onClick: () => void; contentColumnRef: React.RefObject<HTMLDivElement | null> }) {
  const [fabPosition, setFabPosition] = useState<{ right: number } | null>(null)

  useEffect(() => {
    const update = () => {
      if (!contentColumnRef?.current || !window.matchMedia('(min-width: 768px)').matches) {
        setFabPosition(null)
        return
      }
      const rect = contentColumnRef.current.getBoundingClientRect()
      setFabPosition({ right: window.innerWidth - rect.right + 20 })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [contentColumnRef])

  return (
    <div
      className="fixed z-30"
      style={{
        bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
        right: fabPosition?.right ?? 24,
        transform: "translateZ(0)",
        WebkitBackfaceVisibility: "hidden",
        backfaceVisibility: "hidden",
      }}
    >
      <Button
        onClick={onClick}
        size="icon"
        className="h-14 w-14 md:h-12 md:w-12 rounded-full shadow-lg"
        style={{ touchAction: "manipulation" }}
        aria-label="Add goal"
      >
        <Plus className="h-6 w-6 md:h-5 md:w-5" />
      </Button>
    </div>
  )
}

// --- Goal Form Modal ---

interface GoalFormData {
  title: string
  description: string
  priority: number
  metrics: string
  deadline: string
  risks: string
}

function GoalFormModal({ goal, onSubmit, onClose }: {
  goal: Goal | null
  onSubmit: (data: GoalFormData) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(goal?.title || '')
  const [description, setDescription] = useState(goal?.description || '')
  const [priority, setPriority] = useState(goal?.priority || 2)
  const [metrics, setMetrics] = useState(goal?.metrics || '')
  const [deadline, setDeadline] = useState(goal?.deadline || (goal ? '' : defaultDeadline()))
  const [risks, setRisks] = useState(goal?.risks || '')
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => titleRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError('Please add a title'); return }
    onSubmit({ title: title.trim(), description: description.trim(), priority, metrics: metrics.trim(), deadline, risks: risks.trim() })
  }

  const fixedStyle: React.CSSProperties = {
    transform: "translateZ(0)",
    WebkitBackfaceVisibility: "hidden",
    backfaceVisibility: "hidden",
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" style={fixedStyle} onClick={onClose} aria-hidden="true" />
      <div
        className="fixed inset-x-4 z-50 mx-auto max-w-md"
        style={{ ...fixedStyle, top: "50%", transform: "translateY(-50%) translateZ(0)", maxHeight: "calc(100dvh - 2rem)", overflowY: "auto" }}
        role="dialog"
        aria-modal="true"
        aria-label={goal ? "Edit goal" : "Add goal"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-background rounded-lg shadow-xl p-6">
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="goal-title" className="text-sm text-muted-foreground">Title</Label>
                <Input ref={titleRef} id="goal-title" value={title} onChange={(e) => { setTitle(e.target.value); setError('') }}
                  placeholder="What are you aiming for?" className="h-10 bg-card border-border/60 shadow-none" />
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Priority</Label>
                <div className="flex gap-2">
                  {[1, 2, 3].map((p) => (
                    <button key={p} type="button" onClick={() => setPriority(p)}
                      className={cn(
                        "rounded px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors",
                        priority === p ? PRIORITY_COLORS[p] : "bg-accent text-muted-foreground"
                      )}>
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal-desc" className="text-sm text-muted-foreground">Success Criteria <span className="text-muted-foreground/60">(optional)</span></Label>
                <Textarea id="goal-desc" value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="How will you know you've achieved this?" rows={2} className="bg-card border-border/60 shadow-none resize-none" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal-metrics" className="text-sm text-muted-foreground">Key Metrics <span className="text-muted-foreground/60">(optional)</span></Label>
                <Input id="goal-metrics" value={metrics} onChange={(e) => setMetrics(e.target.value)}
                  placeholder="e.g. Revenue, NPS, completion rate" className="h-10 bg-card border-border/60 shadow-none" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal-deadline" className="text-sm text-muted-foreground">Deadline <span className="text-muted-foreground/60">(optional)</span></Label>
                <Input id="goal-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
                  className="h-10 bg-card border-border/60 shadow-none" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal-risks" className="text-sm text-muted-foreground">Risks & Blockers <span className="text-muted-foreground/60">(optional)</span></Label>
                <Textarea id="goal-risks" value={risks} onChange={(e) => setRisks(e.target.value)}
                  placeholder="Known risks or blockers..." rows={2} className="bg-card border-border/60 shadow-none resize-none" />
              </div>
            </div>

            <div className="flex items-center gap-4 mt-6">
              <Button type="submit" className="w-full sm:w-auto px-5 h-9 font-medium active:scale-[0.98] transition-transform duration-75">
                {goal ? "Save changes" : "Add Goal"}
              </Button>
              <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm transition-colors duration-100">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
