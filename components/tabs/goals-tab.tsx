"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"
import { useRealtimeChannel } from "@/hooks/use-realtime-channel"
import { cn, formatRelativeTime, groupByPriority } from "@/lib/utils"
import { Target, Trash2, LayoutGrid, X, FileUp, Archive, BarChart3 } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CardActionGroup } from "@/components/ui/card-action-group"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { Goal } from "@/lib/chief-of-staff-types"
import { PRIORITY_LABELS, PRIORITY_COLORS } from "@/lib/chief-of-staff-types"
import { StickyHeader } from "@/components/sticky-header"

interface GoalsTabProps {
  contentColumnRef: React.RefObject<HTMLDivElement | null>
}

export function GoalsTab({ contentColumnRef }: GoalsTabProps) {
  const { user } = useAuth()
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editGoal, setEditGoal] = useState<Goal | null>(null)
  const [detailGoal, setDetailGoal] = useState<Goal | null>(null)
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({})
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const archivingIdRef = useRef<string | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (user) {
      loadGoals()
      loadTaskCounts()
    }
  }, [user])

  // Real-time subscription (pauses when tab is hidden to avoid inflated iOS Screen Time)
  useRealtimeChannel(
    'goals-changes',
    { table: 'goals', filter: `user_id=eq.${user?.id}` },
    () => { if (!archivingIdRef.current) loadGoals() },
  )

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
        .order('created_at', { ascending: false })
      if (error) throw error
      const mapped = (data || []).map((g: any) => ({
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
      }))
      // Only show active/at_risk goals — completed goals live in the Goals Archive page
      // Also filter out the goal currently being archived (optimistic removal)
      const visible = mapped.filter((g: Goal) =>
        g.status !== 'completed' && g.status !== 'archived' && g.id !== archivingIdRef.current
      )
      setGoals(visible)
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

  const handleArchive = async (id: string) => {
    const goal = goals.find(g => g.id === id)
    if (!goal) return

    // Play slide-out-to-right exit animation (same as snooze in Tasks tab)
    setArchivingId(id)
    archivingIdRef.current = id

    setTimeout(async () => {
      setArchivingId(null)
      setGoals(prev => prev.filter(g => g.id !== id))

      try {
        const { error } = await supabase.from('goals').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        }).eq('id', id)
        if (error) throw error
      } catch (error) {
        console.error('Error archiving goal:', error)
        archivingIdRef.current = null
        loadGoals()
        return
      }
      archivingIdRef.current = null
    }, 300) // Match animation duration
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
      <StickyHeader
        title="Weekly Goals"
        byline={<p>{
          goals.length === 0
            ? "All weekly priorities are clear."
            : goals.length === 1
              ? "1 active priority for the week."
              : `${goals.length} active priorities for the week.`
        }</p>}
      />

      {goals.length > 0 ? (
        <div className="flex flex-col gap-6">
          {groupByPriority(goals).map(({ label, items }) => (
            <div key={label}>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">{label}</h2>
              <div className="flex flex-col gap-3">
                {items.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    taskCount={taskCounts[goal.id] || 0}
                    isArchiving={goal.id === archivingId}
                    onView={() => setDetailGoal(goal)}
                    onDelete={() => handleDelete(goal.id)}
                    onArchive={() => handleArchive(goal.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {goals.length > 0 && (
        <p className="text-center text-xs text-slate-400 mt-8 mb-4">
          Powered by knots.bot
        </p>
      )}

      {goals.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <img src="/goals.svg" alt="" aria-hidden="true" className="h-20 w-20 opacity-40 mb-5" />
          <p className="text-lg font-semibold text-foreground mb-1">A winning week.</p>
          <p className="text-muted-foreground text-sm max-w-[300px]">
            All major objectives have been secured.
          </p>
        </div>
      )}

      {/* Speed Dial FAB */}
      <SpeedDialFAB
        onCreateGoal={() => { setEditGoal(null); setIsFormOpen(true) }}
        onUploadGoals={() => setShowTranscript(true)}
        contentColumnRef={contentColumnRef}
      />

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
            setDetailGoal(null)
          }}
          onClose={() => { setIsFormOpen(false); setEditGoal(null); setDetailGoal(null) }}
        />
      )}

      {/* Transcript import modal */}
      {showTranscript && (
        <GoalTranscriptModal
          onClose={() => setShowTranscript(false)}
          onImported={() => { setShowTranscript(false); loadGoals() }}
        />
      )}

      {/* Goal detail modal (view mode) */}
      {detailGoal && !isFormOpen && (
        <GoalDetailModal
          goal={detailGoal}
          onEdit={() => { setEditGoal(detailGoal); setIsFormOpen(true) }}
          onClose={() => setDetailGoal(null)}
        />
      )}
    </>
  )
}

// --- Goal Card ---

function GoalCard({ goal, taskCount, isArchiving, onView, onDelete, onArchive }: {
  goal: Goal
  taskCount: number
  isArchiving?: boolean
  onView: () => void
  onDelete: () => void
  onArchive: () => void
}) {
  const isCompleted = goal.status === 'completed'

  // Delete confirmation (two-step: trash icon → "Delete?" button → confirm)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (confirmingDelete) {
      confirmTimer.current = setTimeout(() => setConfirmingDelete(false), 3000)
      return () => { if (confirmTimer.current) clearTimeout(confirmTimer.current) }
    }
  }, [confirmingDelete])

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    onDelete()
  }

  // Auto at-risk: deadline within 2 days and not completed
  const isAtRisk = !isCompleted && (() => {
    if (!goal.deadline) return false
    const deadlineDate = new Date(goal.deadline + 'T23:59:59')
    const now = new Date()
    const diffMs = deadlineDate.getTime() - now.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    return diffDays <= 2
  })()

  return (
    <div
      className={cn(
        "group rounded-[24px] bg-card p-5 transition-[background-color,opacity] duration-200",
        !isCompleted && !isAtRisk && "hover:bg-accent-hover",
        isCompleted && "bg-accent-subtle opacity-75",
        isAtRisk && "bg-[#FFF5F5] dark:bg-red-950/30 hover:bg-red-100/80 dark:hover:bg-red-950/40",
        isArchiving && "animate-out fade-out slide-out-to-right duration-300 fill-mode-forwards",
        !isArchiving && "animate-in fade-in duration-300",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Selection circle */}
        <button
          onClick={() => onArchive()}
          style={{ touchAction: "manipulation" }}
          className="mt-[3px] shrink-0 h-5 w-5 rounded-full border-2 border-slate-300 hover:border-slate-400 transition-colors flex items-center justify-center"
          aria-label={isCompleted ? "Completed" : "Mark as complete"}
        >
          {isCompleted && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
        </button>

        {/* Content — click opens detail modal */}
        <div className="min-w-0 flex-1 cursor-pointer" onClick={onView}>
          <p className={cn(
            "text-base font-semibold leading-snug text-foreground",
            isCompleted && "text-muted-foreground line-through decoration-muted-foreground/50"
          )}>
            {goal.title}
          </p>
          <span className={cn(
            "inline-block mt-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            PRIORITY_COLORS[goal.priority]
          )}>
            {PRIORITY_LABELS[goal.priority]}
          </span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            {goal.deadline ? `Due ${goal.deadline}` : formatRelativeTime(goal.createdAt)}
            {taskCount > 0 && <> · {taskCount} linked {taskCount === 1 ? 'task' : 'tasks'}</>}
          </span>
        </div>

        {/* Actions */}
        <CardActionGroup>
          {!confirmingDelete && (
            <button
              onClick={handleDeleteClick}
              className="shrink-0 flex items-center justify-center w-11 h-11 rounded-md transition-[color,opacity] text-slate-200 hover:text-slate-400 opacity-60 sm:opacity-0 sm:group-hover:opacity-60 sm:group-hover:hover:opacity-100 hover:opacity-100"
              aria-label="Delete goal"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          )}
          {confirmingDelete && (
            <button
              onClick={handleDeleteClick}
              className="shrink-0 px-3 py-1 rounded-full text-xs font-medium text-rose-500 bg-[#FFF5F5] border border-rose-100 hover:bg-rose-50 transition-colors"
              aria-label="Confirm delete"
            >
              Delete?
            </button>
          )}
        </CardActionGroup>
      </div>
    </div>
  )
}

// --- Goal Detail Modal (View Mode) ---

function GoalDetailModal({ goal, onEdit, onClose }: {
  goal: Goal
  onEdit: () => void
  onClose: () => void
}) {
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
        aria-label="Goal details"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-background rounded-[32px] shadow-xl p-6">
          {/* Title */}
          <h2 className="text-lg font-bold text-foreground mb-1">{goal.title}</h2>

          {/* Priority + Deadline */}
          <div className="flex items-center gap-2 mb-4">
            <span className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              PRIORITY_COLORS[goal.priority]
            )}>
              {PRIORITY_LABELS[goal.priority]}
            </span>
            {goal.deadline && (
              <span className="text-xs text-slate-400">Due {goal.deadline}</span>
            )}
          </div>

          {/* Description */}
          {goal.description && (
            <div className="mb-4">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">DESCRIPTION</span>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">{goal.description}</p>
            </div>
          )}

          {/* Dependencies & Risks */}
          {goal.risks && (
            <div className="mb-4">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">DEPENDENCIES & RISKS</span>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">{goal.risks}</p>
            </div>
          )}

          {/* Edit button */}
          <button
            onClick={() => { onEdit(); onClose() }}
            className="w-full h-10 rounded-xl bg-[#4A7188] hover:bg-[#3d6175] text-white text-sm font-medium transition-colors active:scale-[0.98] duration-75"
          >
            EDIT
          </button>
        </div>
      </div>
    </>
  )
}

// --- Speed Dial FAB ---

function SpeedDialFAB({ onCreateGoal, onUploadGoals, contentColumnRef }: {
  onCreateGoal: () => void
  onUploadGoals: () => void
  contentColumnRef: React.RefObject<HTMLDivElement | null>
}) {
  const [isOpen, setIsOpen] = useState(false)
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

  // Close on scroll
  useEffect(() => {
    if (!isOpen) return
    const close = () => setIsOpen(false)
    window.addEventListener('scroll', close, { passive: true, capture: true })
    return () => window.removeEventListener('scroll', close, true)
  }, [isOpen])

  const handleAction = (action: () => void) => {
    setIsOpen(false)
    action()
  }

  const fixedStyle: React.CSSProperties = {
    transform: "translateZ(0)",
    WebkitBackfaceVisibility: "hidden",
    backfaceVisibility: "hidden",
  }

  return (
    <>
      {/* Scrim overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 animate-in fade-in duration-200"
          style={fixedStyle}
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* FAB container */}
      <div
        className="fixed z-50"
        style={{
          ...fixedStyle,
          bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
          right: fabPosition?.right ?? 24,
        }}
      >
        {/* Speed dial menu items */}
        {isOpen && (
          <div className="absolute bottom-16 right-0 flex flex-col items-end gap-3 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* Top item: Upload weekly goals */}
            <button
              onClick={() => handleAction(onUploadGoals)}
              className="flex items-center gap-3 group min-h-[48px]"
              style={{ touchAction: "manipulation" }}
            >
              <span className="rounded-full bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-md whitespace-nowrap">
                Upload weekly goals
              </span>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-foreground shadow-md">
                <FileUp className="h-5 w-5" />
              </span>
            </button>

            {/* Middle item: Create a goal */}
            <button
              onClick={() => handleAction(onCreateGoal)}
              className="flex items-center gap-3 group min-h-[48px]"
              style={{ touchAction: "manipulation" }}
            >
              <span className="rounded-full bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-md whitespace-nowrap">
                Create a goal
              </span>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-foreground shadow-md">
                <Target className="h-5 w-5" />
              </span>
            </button>

            {/* Analytics */}
            <Link
              href="/analytics"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 group min-h-[48px]"
              style={{ touchAction: "manipulation" }}
            >
              <span className="rounded-full bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-md whitespace-nowrap">
                Analytics
              </span>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-foreground shadow-md">
                <BarChart3 className="h-5 w-5" />
              </span>
            </Link>

            {/* Goals archive */}
            <Link
              href="/goals-archive"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 group min-h-[48px]"
              style={{ touchAction: "manipulation" }}
            >
              <span className="rounded-full bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-md whitespace-nowrap">
                Goals archive
              </span>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-foreground shadow-md">
                <Archive className="h-5 w-5" />
              </span>
            </Link>
          </div>
        )}

        {/* Main FAB button */}
        <Button
          onClick={() => setIsOpen(!isOpen)}
          size="icon"
          className="h-14 w-14 md:h-12 md:w-12 rounded-full shadow-lg bg-[#4A7188] hover:bg-[#3d6175] text-white"
          style={{ touchAction: "manipulation" }}
          aria-label={isOpen ? "Close menu" : "Add goal"}
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <X className="h-6 w-6 md:h-5 md:w-5 transition-transform duration-200" />
          ) : (
            <LayoutGrid className="h-6 w-6 md:h-5 md:w-5 transition-transform duration-200" />
          )}
        </Button>
      </div>
    </>
  )
}

// --- Goal Form Modal ---

interface GoalFormData {
  title: string
  description: string
  priority: number
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
  const [deadline, setDeadline] = useState(() => {
    if (goal?.deadline) return goal.deadline
    // Default to 1 week from now for new goals
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().split('T')[0]
  })
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
    if (!description.trim()) { setError('Please add a description'); return }
    onSubmit({ title: title.trim(), description: description.trim(), priority, deadline, risks: risks.trim() })
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
        <div className="bg-background rounded-[32px] shadow-xl p-6">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-foreground mb-2">{goal ? "Edit Goal" : "Create a Goal"}</h2>
            <p className="text-sm text-muted-foreground">Define a new priority for the week.</p>
          </div>
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
                        "rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors border",
                        priority === p
                          ? "text-orange-600 bg-orange-50 border-orange-200"
                          : "bg-accent text-muted-foreground border-transparent"
                      )}>
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal-desc" className="text-sm text-muted-foreground">Description</Label>
                <Textarea id="goal-desc" value={description} onChange={(e) => { setDescription(e.target.value); setError('') }}
                  placeholder="Describe the goal..." rows={2} className="bg-card border-border/60 shadow-none resize-none" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal-deadline" className="text-sm text-muted-foreground">Deadline <span className="text-muted-foreground/60">(optional)</span></Label>
                <Input id="goal-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
                  className="h-10 bg-card border-border/60 shadow-none" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal-risks" className="text-sm text-muted-foreground">Dependencies & Risks <span className="text-muted-foreground/60">(optional)</span></Label>
                <Textarea id="goal-risks" value={risks} onChange={(e) => setRisks(e.target.value)}
                  placeholder="Dependencies, risks, or blockers..." rows={2} className="bg-card border-border/60 shadow-none resize-none" />
              </div>
            </div>

            <div className="flex items-center gap-4 mt-6">
              <Button type="submit" className="w-full px-5 h-10 font-medium rounded-xl bg-[#4A7188] hover:bg-[#3d6175] text-white active:scale-[0.98] transition-transform duration-75">
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

// --- Goal Transcript Import Modal ---

function GoalTranscriptModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [transcript, setTranscript] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 100)
  }, [])

  const handleParse = async () => {
    if (!transcript.trim()) {
      setError('Please paste your transcript first')
      return
    }

    setIsProcessing(true)
    setError('')
    setStatus('Analyzing transcript...')

    try {
      const res = await fetch('/api/parse-goals-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcript.trim() }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to parse transcript')
      }

      const data = await res.json()
      const { goalsCreated, goalsUpdated } = data.summary
      const parts: string[] = []
      if (goalsCreated > 0) parts.push(`created ${goalsCreated}`)
      if (goalsUpdated > 0) parts.push(`updated ${goalsUpdated}`)
      setStatus(`Done! ${parts.length > 0 ? parts.join(', ') + ' goals.' : 'No new goals found.'}`)

      setTimeout(() => {
        onImported()
      }, 1500)
    } catch (err: any) {
      console.error('Error parsing goals transcript:', err)
      setError(err.message || 'Something went wrong')
      setIsProcessing(false)
    }
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
        className="fixed inset-x-4 z-50 mx-auto max-w-lg"
        style={{ ...fixedStyle, top: "50%", transform: "translateY(-50%) translateZ(0)", maxHeight: "calc(100dvh - 2rem)", overflowY: "auto" }}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-background rounded-[32px] shadow-xl p-6">
          <h2 className="text-lg font-bold text-foreground mb-2">Import Weekly Goals</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Paste your weekly goals transcript. AI will extract goals with a 1-week deadline.
          </p>

          <Textarea
            ref={textareaRef}
            value={transcript}
            onChange={(e) => { setTranscript(e.target.value); setError('') }}
            placeholder="Paste your transcript here..."
            rows={10}
            className="bg-card border-border/60 shadow-none resize-none mb-4"
            disabled={isProcessing}
          />

          {error && <p className="text-sm text-destructive mb-4">{error}</p>}
          {status && !error && <p className="text-sm text-muted-foreground mb-4">{status}</p>}

          <div className="flex items-center gap-4">
            <Button
              onClick={handleParse}
              disabled={isProcessing || !transcript.trim()}
              className="px-5 h-9 font-medium active:scale-[0.98] transition-transform duration-75"
            >
              {isProcessing ? "Processing..." : "Import Goals"}
            </Button>
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="text-muted-foreground hover:text-foreground text-sm transition-colors duration-100"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
