"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"
import { cn, formatRelativeTime } from "@/lib/utils"
import { Trash2, Plus, Check, ListTodo, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { BacklogItem } from "@/lib/chief-of-staff-types"
import { CATEGORY_LABELS, CATEGORY_COLORS } from "@/lib/chief-of-staff-types"

interface BacklogTabProps {
  contentColumnRef: React.RefObject<HTMLDivElement | null>
}

export function BacklogTab({ contentColumnRef }: BacklogTabProps) {
  const { user } = useAuth()
  const [items, setItems] = useState<BacklogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editItem, setEditItem] = useState<BacklogItem | null>(null)
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [movingToTasksId, setMovingToTasksId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (user) loadItems()
  }, [user])

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
        category: data.category,
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
        category: data.category,
      }).eq('id', id)
      if (error) throw error
      loadItems()
    } catch (error) {
      console.error('Error updating backlog item:', error)
    }
  }

  const handleDelete = async (id: string) => {
    setItems((prev) => prev.filter((b) => b.id !== id))
    try {
      const { error } = await supabase.from('backlog').delete().eq('id', id)
      if (error) throw error
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

  const filteredItems = filterCategory
    ? items.filter(b => b.category === filterCategory)
    : items

  const openItems = filteredItems.filter(b => b.status === 'open')
  const resolvedItems = filteredItems.filter(b => b.status === 'resolved')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading backlog...</p>
      </div>
    )
  }

  return (
    <>
      <header className="mb-6 md:mb-8">
        <h1 className="mb-2 text-2xl font-bold text-foreground">Backlog</h1>
        <p className="text-muted-foreground">Things to think about, decide, or fix.</p>
      </header>

      {/* Category filter chips */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          onClick={() => setFilterCategory(null)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
            !filterCategory ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"
          )}
        >
          All
        </button>
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilterCategory(filterCategory === key ? null : key)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
              filterCategory === key ? CATEGORY_COLORS[key] : "bg-accent text-muted-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {openItems.length > 0 ? (
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
      ) : (
        <p className="py-8 text-center text-muted-foreground">
          {filterCategory ? `No open ${CATEGORY_LABELS[filterCategory].toLowerCase()} items.` : 'No open items. Add something to your backlog.'}
        </p>
      )}

      {resolvedItems.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
            Resolved ({resolvedItems.length})
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
    if (!isResolved && !confirmingDelete) {
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
      {/* Resolve button */}
      <button
        onClick={onResolve}
        className={cn(
          "mt-0.5 shrink-0 rounded-full w-5 h-5 border-2 flex items-center justify-center transition-colors",
          isResolved
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/30 hover:border-primary"
        )}
        aria-label={isResolved ? "Reopen" : "Resolve"}
      >
        {isResolved && <Check className="h-3 w-3" />}
      </button>

      {/* Content */}
      <div className="min-w-0 flex-1 cursor-pointer" onClick={onEdit}>
        <div className="flex items-center gap-2">
          <span className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shrink-0",
            CATEGORY_COLORS[item.category]
          )}>
            {CATEGORY_LABELS[item.category]}
          </span>
          <span className={cn(
            "text-base font-semibold text-foreground truncate",
            isResolved && "text-muted-foreground line-through decoration-muted-foreground/50"
          )}>
            {item.title}
          </span>
        </div>
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
      <div className="flex shrink-0 items-center gap-0.5 relative">
        <button
          onClick={(e) => { e.stopPropagation(); onMoveToTasks() }}
          className="shrink-0 p-1.5 rounded-md text-muted-foreground/50 hover:text-primary transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          aria-label={`Move ${item.title} to tasks`}
        >
          <ListTodo className="h-4 w-4" />
        </button>
        {!confirmingDelete && (
          <button
            onClick={handleDeleteClick}
            className="shrink-0 p-1.5 rounded-md text-muted-foreground/50 hover:text-destructive transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            aria-label={`Delete ${item.title}`}
          >
            <Trash2 className="h-4 w-4" />
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

      </div>
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
  category: 'question' | 'decision' | 'process' | 'idea' | 'action'
}

function BacklogFormModal({ item, onSubmit, onClose }: {
  item: BacklogItem | null
  onSubmit: (data: BacklogFormData) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(item?.title || '')
  const [description, setDescription] = useState(item?.description || '')
  const [category, setCategory] = useState<BacklogFormData['category']>(item?.category || 'action')
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => titleRef.current?.focus(), 100)
    return () => clearTimeout(t)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError('Please add a title'); return }
    onSubmit({ title: title.trim(), description: description.trim(), category })
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
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="backlog-title" className="text-sm text-muted-foreground">Title</Label>
                <Input ref={titleRef} id="backlog-title" value={title} onChange={(e) => { setTitle(e.target.value); setError('') }}
                  placeholder="What needs attention?" className="h-10 bg-card border-border/60 shadow-none" />
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Category</Label>
                <div className="flex gap-2 flex-wrap">
                  {(Object.entries(CATEGORY_LABELS) as [BacklogFormData['category'], string][]).map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setCategory(key)}
                      className={cn(
                        "rounded px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors",
                        category === key ? CATEGORY_COLORS[key] : "bg-accent text-muted-foreground"
                      )}>
                      {label}
                    </button>
                  ))}
                </div>
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
