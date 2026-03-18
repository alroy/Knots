"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"
import { cn, formatRelativeTime } from "@/lib/utils"
import { Trash2, Plus, Check, ListTodo, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CardActionGroup, cardActionMutedClass, cardActionDestructiveClass } from "@/components/ui/card-action-group"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { BacklogItem } from "@/lib/chief-of-staff-types"
import { StickyHeader } from "@/components/sticky-header"

interface BacklogTabProps {
  contentColumnRef: React.RefObject<HTMLDivElement | null>
  isActive?: boolean
}

export function BacklogTab({ contentColumnRef, isActive }: BacklogTabProps) {
  const { user } = useAuth()
  const [items, setItems] = useState<BacklogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editItem, setEditItem] = useState<BacklogItem | null>(null)
  const [movingToTasksId, setMovingToTasksId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (user) loadItems()
  }, [user])

  // Reload when tab becomes active (catches snooze/unsnooze changes from other tabs)
  useEffect(() => {
    if (isActive && user) loadItems()
  }, [isActive])

  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('backlog-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'backlog', filter: `user_id=eq.${user.id}` }, () => {
        loadItems()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  const loadItems = async () => {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('backlog')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('position', { ascending: true })
      if (error) throw error
      setItems((data || []).map((b: any) => ({
        id: b.id,
        title: b.title,
        description: b.description || '',
        category: b.category,
        status: b.status,
        position: b.position,
        createdAt: b.created_at,
        resolvedAt: b.resolved_at,
        snoozedUntil: b.snoozed_until || null,
        sourceType: b.source_type || null,
        goalId: b.goal_id || null,
      })))
    } catch (error) {
      console.error('Error loading backlog:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (data: BacklogFormData) => {
    if (!user) return
    try {
      const { error } = await supabase.from('backlog').insert({
        title: data.title,
        description: data.description,
        user_id: user.id,
        position: 0,
      })
      if (error) throw error
      loadItems()
    } catch (error) {
      console.error('Error adding backlog item:', error)
    }
  }

  const handleUpdate = async (id: string, data: BacklogFormData) => {
    try {
      const { error } = await supabase.from('backlog').update({
        title: data.title,
        description: data.description,
      }).eq('id', id)
      if (error) throw error
      loadItems()
    } catch (error) {
      console.error('Error updating backlog item:', error)
    }
  }

  const handleDelete = async (id: string) => {
    const item = items.find(b => b.id === id)
    setItems((prev) => prev.filter((b) => b.id !== id))
    try {
      if (item?.status === 'resolved') {
        // Soft-delete resolved items so analytics still counts them
        const { error } = await supabase.from('backlog').update({ deleted_at: new Date().toISOString() }).eq('id', id)
        if (error) throw error
        // Clean up any orphaned task row left by race condition in completion flow
        if (user) {
          await supabase.from('tasks').delete()
            .eq('user_id', user.id)
            .eq('title', item.title)
            .eq('status', 'completed')
        }
      } else {
        const { error } = await supabase.from('backlog').delete().eq('id', id)
        if (error) throw error
      }
    } catch (error) {
      console.error('Error deleting backlog item:', error)
      loadItems()
    }
  }

  const handleResolve = async (id: string) => {
    const item = items.find(b => b.id === id)
    if (!item) return
    const nextStatus = item.status === 'open' ? 'resolved' : 'open'
    setItems(prev => prev.map(b => b.id === id ? { ...b, status: nextStatus } : b))
    try {
      const { error } = await supabase.from('backlog').update({
        status: nextStatus,
        resolved_at: nextStatus === 'resolved' ? new Date().toISOString() : null,
      }).eq('id', id)
      if (error) throw error
    } catch (error) {
      console.error('Error resolving backlog item:', error)
      loadItems()
    }
  }

  const handleMoveToTasks = async (id: string) => {
    const item = items.find(b => b.id === id)
    if (!item || !user) return

    // Play slide-out-to-left exit animation, then remove and persist
    setMovingToTasksId(id)

    setTimeout(async () => {
      setMovingToTasksId(null)
      setItems((prev) => prev.filter((b) => b.id !== id))

      try {
        // Insert into tasks, preserving original created_at
        const { error: insertError } = await supabase.from('tasks').insert({
          title: item.title,
          description: item.description,
          status: 'active',
          user_id: user.id,
          position: 0,
          source_type: item.sourceType || null,
          goal_id: item.goalId || null,
          ...(item.createdAt ? { created_at: item.createdAt } : {}),
        })
        if (insertError) throw insertError

        // Delete from backlog
        const { error: deleteError } = await supabase.from('backlog').delete().eq('id', id)
        if (deleteError) throw deleteError
      } catch (error) {
        console.error('Error moving backlog item to tasks:', error)
        loadItems() // Rollback
      }
    }, 300) // Match animation duration
  }

  const handleSnooze = async (id: string, until: Date) => {
    const item = items.find(b => b.id === id)
    if (!item) return

    const snoozedUntil = until.toISOString()
    setItems(prev => prev.map(b => b.id === id ? { ...b, snoozedUntil } : b))

    try {
      const { error } = await supabase.from('backlog').update({
        snoozed_until: snoozedUntil,
      }).eq('id', id)
      if (error) throw error
    } catch (error) {
      console.error('Error snoozing backlog item:', error)
      loadItems()
    }
  }

  const handleCancelSnooze = async (id: string) => {
    setItems(prev => prev.map(b => b.id === id ? { ...b, snoozedUntil: null } : b))
    try {
      const { error } = await supabase.from('backlog').update({
        snoozed_until: null,
      }).eq('id', id)
      if (error) throw error
    } catch (error) {
      console.error('Error cancelling snooze:', error)
      loadItems()
    }
  }

  // Auto-promote snoozed items that are due (runs once after items load)
  const promotedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!user || items.length === 0) return
    const now = new Date()
    const dueItems = items.filter(b =>
      b.snoozedUntil && new Date(b.snoozedUntil) <= now && b.status === 'open' && !promotedRef.current.has(b.id)
    )
    for (const item of dueItems) {
      promotedRef.current.add(item.id)
      handleMoveToTasks(item.id)
    }
  }, [items, user])

  // Sort into three zones: Active (manual, no snooze) → Snoozed → Resolved
  const activeItems = items
    .filter(b => b.status === 'open' && !b.snoozedUntil)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
  const snoozedItems = items
    .filter(b => b.status === 'open' && b.snoozedUntil)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
  const resolvedItems = items.filter(b => b.status === 'resolved')
  const openItems = [...activeItems, ...snoozedItems]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading backlog...</p>
      </div>
    )
  }

  return (
    <>
      <StickyHeader
        title="Backlog"
        byline={<p>{
          items.length === 0
            ? "Your parking lot is clear."
            : items.length === 1
              ? "1 item parked for future review."
              : `${items.length} items parked for future review.`
        }</p>}
      />

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <img src="/backlog.svg" alt="" aria-hidden="true" className="h-20 w-20 opacity-40 mb-5" />
          <p className="text-lg font-semibold text-foreground mb-1">Clear backlog.</p>
          <p className="text-muted-foreground text-sm max-w-[300px]">
            Your parking lot is empty. Future ideas and snoozed items will rest here.
          </p>
        </div>
      ) : (
        <>
          {openItems.length > 0 && (
            <div className="flex flex-col gap-3">
              {openItems.map((item) => (
                <BacklogCard
                  key={item.id}
                  item={item}
                  onEdit={() => { setEditItem(item); setIsFormOpen(true) }}
                  onDelete={() => handleDelete(item.id)}
                  onResolve={() => handleResolve(item.id)}
                  onMoveToTasks={() => handleMoveToTasks(item.id)}
                  isMovingToTasks={item.id === movingToTasksId}
                  onCancelSnooze={() => handleCancelSnooze(item.id)}
                />
              ))}
            </div>
          )}

          {resolvedItems.length > 0 && (
            <div className={openItems.length > 0 ? "mt-8" : ""}>
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
                Completed ({resolvedItems.length})
              </h2>
              <div className="flex flex-col gap-2">
                {resolvedItems.map((item) => (
                  <BacklogCard
                    key={item.id}
                    item={item}
                    onEdit={() => { setEditItem(item); setIsFormOpen(true) }}
                    onDelete={() => handleDelete(item.id)}
                    onResolve={() => handleResolve(item.id)}
                    onMoveToTasks={() => handleMoveToTasks(item.id)}
                    isMovingToTasks={item.id === movingToTasksId}
                    onCancelSnooze={() => handleCancelSnooze(item.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <FAB onClick={() => { setEditItem(null); setIsFormOpen(true) }} contentColumnRef={contentColumnRef} />

      {isFormOpen && (
        <BacklogFormModal
          item={editItem}
          onSubmit={(data) => {
            if (editItem) {
              handleUpdate(editItem.id, data)
            } else {
              handleAdd(data)
            }
            setIsFormOpen(false)
            setEditItem(null)
          }}
          onClose={() => { setIsFormOpen(false); setEditItem(null) }}
        />
      )}
    </>
  )
}

// --- Backlog Card ---

function BacklogCard({ item, onEdit, onDelete, onResolve, onMoveToTasks, isMovingToTasks, onCancelSnooze }: {
  item: BacklogItem; onEdit: () => void; onDelete: () => void; onResolve: () => void; onMoveToTasks: () => void
  isMovingToTasks?: boolean; onCancelSnooze: () => void
}) {
  const isResolved = item.status === 'resolved'
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
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    setConfirmingDelete(false)
    onDelete()
  }

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-lg bg-card p-4 transition-[background-color,opacity] duration-200",
        !isResolved && "hover:bg-accent-hover",
        isResolved && "bg-accent-subtle opacity-75",
        isMovingToTasks && "animate-out fade-out slide-out-to-left duration-300 fill-mode-forwards",
      )}
    >
      {/* Checkbox: resolve for open items, restore to Inbox for resolved items */}
      <button
        onClick={isResolved ? onMoveToTasks : onResolve}
        className={cn(
          "mt-[3px] shrink-0 rounded-full w-5 h-5 border-2 flex items-center justify-center transition-colors",
          isResolved
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/30 hover:border-primary"
        )}
        aria-label={isResolved ? "Restore to Inbox" : "Resolve"}
      >
        {isResolved && <Check className="h-3 w-3" />}
      </button>

      {/* Content */}
      <div className="min-w-0 flex-1 cursor-pointer" onClick={onEdit}>
        <span className={cn(
          "text-base font-semibold text-foreground truncate block",
          isResolved && "text-muted-foreground line-through decoration-muted-foreground/50"
        )}>
          {item.title}
        </span>
        {!(item.snoozedUntil && !isResolved) && (
          <span className="text-xs text-muted-foreground">{formatRelativeTime(item.createdAt)}</span>
        )}
        {item.snoozedUntil && !isResolved && (
          <button
            onClick={(e) => { e.stopPropagation(); onCancelSnooze() }}
            className="mt-1 inline-flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors"
          >
            <Clock className="h-3 w-3" />
            Snoozed until {new Date(item.snoozedUntil).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            <span className="text-muted-foreground/50 ml-0.5">&times;</span>
          </button>
        )}
        {item.description && (
          <p className={cn(
            "mt-1 text-sm text-muted-foreground line-clamp-2",
            isResolved && "text-muted-foreground/70"
          )}>
            {item.description}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <CardActionGroup>
        {/* Move to tasks — only for open items (resolved items use checkbox to restore) */}
        {!isResolved && (
          <button
            onClick={(e) => { e.stopPropagation(); onMoveToTasks() }}
            className={cardActionMutedClass}
            aria-label={`Move ${item.title} to tasks`}
          >
            <ListTodo className="h-5 w-5" />
          </button>
        )}
        {!confirmingDelete && (
          <button
            onClick={handleDeleteClick}
            className={cardActionDestructiveClass}
            aria-label={`Delete ${item.title}`}
          >
            <Trash2 className="h-5 w-5" />
          </button>
        )}
        {confirmingDelete && (
          <button
            onClick={handleDeleteClick}
            className="shrink-0 px-2 py-1 rounded-md text-xs font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 transition-colors"
            aria-label="Confirm delete"
          >
            Delete?
          </button>
        )}
      </CardActionGroup>
    </div>
  )
}

// --- FAB ---

function FAB({ onClick, contentColumnRef }: { onClick: () => void; contentColumnRef: React.RefObject<HTMLDivElement | null> }) {
  const [fabPosition, setFabPosition] = useState<{ right: number } | null>(null)

  useEffect(() => {
    const update = () => {
      if (!contentColumnRef?.current || !window.matchMedia('(min-width: 768px)').matches) {
        setFabPosition(null); return
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
        aria-label="Add backlog item"
      >
        <Plus className="h-6 w-6 md:h-5 md:w-5" />
      </Button>
    </div>
  )
}

// --- Backlog Form Modal ---

interface BacklogFormData {
  title: string
  description: string
}

function BacklogFormModal({ item, onSubmit, onClose }: {
  item: BacklogItem | null
  onSubmit: (data: BacklogFormData) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(item?.title || '')
  const [description, setDescription] = useState(item?.description || '')
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => titleRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError('Please add a title'); return }
    onSubmit({ title: title.trim(), description: description.trim() })
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
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-background rounded-lg shadow-xl p-6">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-foreground mb-2">{item ? "Edit Item" : "Add to Backlog"}</h2>
            <p className="text-sm text-muted-foreground">Park an idea, question, or future task.</p>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="backlog-title" className="text-sm text-muted-foreground">Title</Label>
                <Input ref={titleRef} id="backlog-title" value={title} onChange={(e) => { setTitle(e.target.value); setError('') }}
                  placeholder="What needs attention?" className="h-10 bg-card border-border/60 shadow-none" />
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="backlog-desc" className="text-sm text-muted-foreground">Description <span className="text-muted-foreground/60">(optional)</span></Label>
                <Textarea id="backlog-desc" value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="More context..." rows={3} className="bg-card border-border/60 shadow-none resize-none" />
              </div>
            </div>

            <div className="flex items-center gap-4 mt-6">
              <Button type="submit" className="w-full sm:w-auto px-5 h-9 font-medium active:scale-[0.98] transition-transform duration-75">
                {item ? "Save changes" : "Add to Backlog"}
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
