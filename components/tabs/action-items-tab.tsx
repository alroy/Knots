"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"
import { cn, formatRelativeTime } from "@/lib/utils"
import { Check, Trash2, MessageSquare, Video, RefreshCw, Clock, ClipboardList } from "lucide-react"
import { KnotForm, type EditTask, type GoalOption } from "@/components/knot-form"
import { ProvenanceRow } from "@/components/ui/slack-badge"
import { TaskMetadata, isSlackMetadata, isGranolaMetadata } from "@/lib/types"
import { prepareTaskForListView, detectSlackTask } from "@/lib/slack/text-utils"
import { StickyHeader } from "@/components/sticky-header"

/** Strip "Source: https://..." from text — handles trailing, inline, and newline-prefixed */
function stripSourceSuffix(text: string): string {
  return text
    .replace(/[\s.]*Source:\s*https?:\/\/\S+/gi, '')
    .trim()
}

/** Normalize a Slack permalink for dedup comparison — strips varying query params */
function normalizeSlackUrl(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.delete('cid')
    u.searchParams.delete('thread_ts')
    return u.origin + u.pathname
  } catch {
    return url.toLowerCase().trim()
  }
}

// --- Unified inbox item that can come from action_items or tasks table ---

type InboxOrigin = 'action-item' | 'task'

interface InboxItem {
  id: string
  origin: InboxOrigin
  title: string
  description: string
  // Source provenance
  source: 'slack' | 'granola' | 'manual'
  sourceChannel: string | null
  messageFrom: string | null
  messageLink: string | null
  // Timestamps
  createdAt: string
  messageTimestamp: string | null
  // Status
  status: 'new' | 'done' | 'dismissed' | 'active' | 'completed'
  // Task-specific fields
  metadata?: TaskMetadata
  sourceType?: string
  sourceUrl?: string
  goalId?: string | null
  position?: number
  // Action-item-specific fields
  rawContext: string | null
}

interface ActionItemsTabProps {
  contentColumnRef: React.RefObject<HTMLDivElement | null>
}

export function ActionItemsTab({ contentColumnRef }: ActionItemsTabProps) {
  const { user } = useAuth()
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  // filterSource removed — origin is already shown in card metadata footer
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [exitingId, setExitingId] = useState<string | null>(null)
  const [goals, setGoals] = useState<GoalOption[]>([])
  const [editTask, setEditTask] = useState<EditTask | null>(null)
  const supabase = createClient()
  const locallyCreatedIds = useRef<Set<string>>(new Set())
  const editTaskRef = useRef<EditTask | null>(null)
  useEffect(() => { editTaskRef.current = editTask }, [editTask])

  useEffect(() => {
    if (user) {
      loadAllItems()
      loadGoals()
    }
  }, [user])

  // Reload goals when editing starts to include assigned (possibly completed) goal
  useEffect(() => {
    if (editTask?.goalId) {
      loadGoals(editTask.goalId)
    }
  }, [editTask])

  // Real-time subscriptions for both tables
  useEffect(() => {
    if (!user) return
    const actionChannel = supabase
      .channel('inbox-action-items-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'action_items', filter: `user_id=eq.${user.id}` }, () => {
        loadAllItems()
      })
      .subscribe()

    const tasksChannel = supabase
      .channel('inbox-tasks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newTask = payload.new as any
          if (locallyCreatedIds.current.has(newTask.id)) {
            locallyCreatedIds.current.delete(newTask.id)
            return
          }
        }
        loadAllItems()
      })
      .subscribe()

    const goalsChannel = supabase
      .channel('inbox-goals-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals', filter: `user_id=eq.${user.id}` }, () => {
        loadGoals(editTaskRef.current?.goalId)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(actionChannel)
      supabase.removeChannel(tasksChannel)
      supabase.removeChannel(goalsChannel)
    }
  }, [user])

  const loadAllItems = async () => {
    if (!user) return
    try {
      // Load both tables in parallel
      const [actionResult, tasksResult] = await Promise.all([
        supabase
          .from('action_items')
          .select('*')
          .eq('user_id', user.id)
          .order('message_timestamp', { ascending: false, nullsFirst: false }),
        supabase
          .from('tasks')
          .select('*')
          .eq('user_id', user.id)
          .order('position', { ascending: true }),
      ])

      if (actionResult.error) throw actionResult.error
      if (tasksResult.error) throw tasksResult.error

      const actionItems: InboxItem[] = (actionResult.data || []).map((row: any) => ({
        id: row.id,
        origin: 'action-item' as const,
        title: stripSourceSuffix(row.action_item),
        description: '',
        source: row.source as 'slack' | 'granola',
        sourceChannel: row.source_channel,
        messageFrom: row.message_from,
        messageLink: row.message_link,
        createdAt: row.created_at,
        messageTimestamp: row.message_timestamp,
        status: row.status,
        rawContext: row.raw_context,
      }))

      const taskItems: InboxItem[] = (tasksResult.data || []).map((row: any) => {
        // Determine source for tasks
        let source: 'slack' | 'granola' | 'manual' = 'manual'
        if (row.source_type === 'slack') source = 'slack'
        else if (row.source_type === 'granola') source = 'granola'
        else if (row.metadata?.source?.type === 'slack') source = 'slack'
        else if (row.metadata?.source?.type === 'granola') source = 'granola'

        return {
          id: row.id,
          origin: 'task' as const,
          title: stripSourceSuffix(row.title),
          description: stripSourceSuffix(row.description || ''),
          source,
          sourceChannel: null,
          messageFrom: null,
          messageLink: row.source_url || null,
          createdAt: row.created_at,
          messageTimestamp: row.created_at,
          status: row.status as InboxItem['status'],
          metadata: row.metadata || undefined,
          sourceType: row.source_type || undefined,
          sourceUrl: row.source_url || undefined,
          goalId: row.goal_id || null,
          position: row.position ?? 0,
          rawContext: null,
        }
      })

      // Cross-table deduplication: if an action_item has the same title as a task,
      // prefer the task (richer data: metadata, goal_id, source provenance).
      // Also deduplicate by message_link matching source_url.
      const taskTitles = new Set(taskItems.map(t => t.title.toLowerCase().trim()))
      const taskSourceUrls = new Set(
        taskItems
          .map(t => t.messageLink || t.sourceUrl)
          .filter((url): url is string => !!url)
          .map(normalizeSlackUrl)
      )

      const dedupedActionItems = actionItems.filter(ai => {
        // Skip action items whose title already exists as a task
        if (taskTitles.has(ai.title.toLowerCase().trim())) return false
        // Skip action items whose message_link matches a task's source_url
        if (ai.messageLink && taskSourceUrls.has(normalizeSlackUrl(ai.messageLink))) return false
        return true
      })

      // Merge: tasks first (they have explicit positions), then deduplicated action items
      setItems([...taskItems, ...dedupedActionItems])
    } catch (error) {
      console.error('Error loading inbox items:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadGoals = async (assignedGoalId?: string | null) => {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('goals')
        .select('id, title, priority, status')
        .eq('user_id', user.id)
        .in('status', ['active', 'at_risk'])
        .order('priority', { ascending: true })
      if (error) throw error
      const activeGoals = (data || []).map((g: any) => ({ id: g.id, title: g.title, priority: g.priority, status: g.status as string }))

      // If editing an item with an assigned goal that's no longer active, fetch it separately
      if (assignedGoalId && !activeGoals.some((g) => g.id === assignedGoalId)) {
        const { data: assignedData } = await supabase
          .from('goals')
          .select('id, title, priority, status')
          .eq('id', assignedGoalId)
          .single()
        if (assignedData) {
          activeGoals.push({ id: assignedData.id, title: assignedData.title, priority: assignedData.priority, status: assignedData.status as string })
        }
      }

      setGoals(activeGoals)
    } catch (error) {
      console.error('Error loading goals:', error)
    }
  }

  // --- Action item handlers ---

  const handleActionItemDone = async (id: string) => {
    const item = items.find(i => i.id === id)
    if (!item || item.origin !== 'action-item') return

    // Animate out then update
    setExitingId(id)
    setTimeout(async () => {
      setExitingId(null)
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'done' } : i))

      try {
        const { error } = await supabase
          .from('action_items')
          .update({ status: 'done' })
          .eq('id', id)
        if (error) throw error
      } catch (error) {
        console.error('Error updating action item status:', error)
        setItems(prev => prev.map(i => i.id === id ? { ...i, status: item.status } : i))
      }
    }, 300)
  }

  const handleActionItemDismiss = async (id: string) => {
    const item = items.find(i => i.id === id)
    if (!item || item.origin !== 'action-item') return

    setExitingId(id)
    setTimeout(async () => {
      setExitingId(null)
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'dismissed' } : i))

      try {
        const { error } = await supabase
          .from('action_items')
          .update({ status: 'dismissed' })
          .eq('id', id)
        if (error) throw error
      } catch (error) {
        console.error('Error dismissing action item:', error)
        setItems(prev => prev.map(i => i.id === id ? { ...i, status: item.status } : i))
      }
    }, 300)
  }

  const handleActionItemReopen = async (id: string) => {
    const item = items.find(i => i.id === id)
    if (!item || item.origin !== 'action-item') return

    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'new' } : i))

    try {
      const { error } = await supabase
        .from('action_items')
        .update({ status: 'new' })
        .eq('id', id)
      if (error) throw error
    } catch (error) {
      console.error('Error reopening action item:', error)
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: item.status } : i))
    }
  }

  // --- Task handlers (snooze, complete, delete) ---

  const handleTaskDone = async (id: string) => {
    const item = items.find(i => i.id === id)
    if (!item || item.origin !== 'task' || !user) return

    // Optimistic: mark completed
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'completed' } : i))

    // Animate out, then move to backlog
    setExitingId(id)
    try {
      // Insert into backlog as resolved
      const { error: insertError } = await supabase.from('backlog').insert({
        title: item.title,
        description: item.description,
        category: 'action',
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        user_id: user.id,
        position: 0,
      })
      if (insertError) throw insertError

      setTimeout(async () => {
        setExitingId(null)
        setItems(prev => prev.filter(i => i.id !== id))
        try {
          const { error: deleteError } = await supabase.from('tasks').delete().eq('id', id)
          if (deleteError) throw deleteError
        } catch (error) {
          console.error('Error deleting completed task:', error)
          loadAllItems()
        }
      }, 300)
    } catch (error) {
      console.error('Error completing task:', error)
      setExitingId(null)
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'active' } : i))
    }
  }

  const handleTaskSnooze = async (id: string, until: Date) => {
    const item = items.find(i => i.id === id)
    if (!item || item.origin !== 'task' || !user) return

    setExitingId(id)

    setTimeout(async () => {
      setExitingId(null)
      setItems(prev => prev.filter(i => i.id !== id))

      try {
        const { error: insertError } = await supabase.from('backlog').insert({
          title: item.title,
          description: item.description,
          category: 'action',
          user_id: user.id,
          position: 0,
          snoozed_until: until.toISOString(),
          ...(item.createdAt ? { created_at: item.createdAt } : {}),
        })
        if (insertError) throw insertError

        const { error: deleteError } = await supabase.from('tasks').delete().eq('id', id)
        if (deleteError) throw deleteError
      } catch (error) {
        console.error('Error snoozing task:', error)
        loadAllItems()
      }
    }, 300)
  }

  const handleActionItemSnooze = async (id: string) => {
    const item = items.find(i => i.id === id)
    if (!item || item.origin !== 'action-item' || !user) return

    setExitingId(id)

    setTimeout(async () => {
      setExitingId(null)
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'dismissed' } : i))

      try {
        // Mark as dismissed in action_items (acts as "snoozed" since action_items don't have a backlog concept)
        const { error } = await supabase
          .from('action_items')
          .update({ status: 'dismissed' })
          .eq('id', id)
        if (error) throw error
      } catch (error) {
        console.error('Error snoozing action item:', error)
        setItems(prev => prev.map(i => i.id === id ? { ...i, status: item.status } : i))
      }
    }, 300)
  }

  const handleTaskDelete = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    } catch (error) {
      console.error('Error deleting task:', error)
      loadAllItems()
    }
  }

  const handleActionItemDelete = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
    try {
      const { error } = await supabase.from('action_items').delete().eq('id', id)
      if (error) throw error
    } catch (error) {
      console.error('Error deleting action item:', error)
      loadAllItems()
    }
  }

  const handleDelete = (id: string, origin: InboxOrigin) => {
    if (origin === 'task') handleTaskDelete(id)
    else handleActionItemDelete(id)
  }

  // --- FAB: Add new task ---

  const handleAddTask = async (data: { title: string; description: string; goalId?: string | null }) => {
    if (!user) return
    try {
      const insert: Record<string, any> = { title: data.title, description: data.description, status: 'active', user_id: user.id, position: 0 }
      if (data.goalId) insert.goal_id = data.goalId
      const { data: newTask, error } = await supabase
        .from('tasks')
        .insert(insert)
        .select()
        .single()
      if (error) throw error

      locallyCreatedIds.current.add(newTask.id)
      const newItem: InboxItem = {
        id: newTask.id,
        origin: 'task',
        title: newTask.title,
        description: newTask.description || '',
        source: 'manual',
        sourceChannel: null,
        messageFrom: null,
        messageLink: null,
        createdAt: newTask.created_at,
        messageTimestamp: newTask.created_at,
        status: newTask.status,
        metadata: newTask.metadata || undefined,
        position: newTask.position ?? 0,
        rawContext: null,
      }

      setItems(prev => {
        // Insert at the top of the list
        return [newItem, ...prev]
      })
    } catch (error) {
      console.error('Error adding task:', error)
    }
  }

  const handleEditClose = useCallback(() => { setEditTask(null) }, [])

  const handleUpdateTask = useCallback(async (id: string, data: { title: string; description: string; goalId?: string | null }): Promise<boolean> => {
    const item = items.find(i => i.id === id)
    if (!item) return false

    // Check if this is an action-item being promoted to a task
    const isPromotion = editTaskRef.current?._actionItemId === id

    if (isPromotion && user) {
      // Promote: insert into tasks table, delete from action_items
      const oldItem = { ...item }
      setItems(prev => prev.map(i => i.id === id ? {
        ...i,
        origin: 'task' as const,
        title: data.title,
        description: data.description,
        goalId: data.goalId ?? null,
      } : i))

      try {
        const insert: Record<string, any> = {
          title: data.title,
          description: data.description,
          status: 'active',
          user_id: user.id,
          position: 0,
        }
        if (data.goalId) insert.goal_id = data.goalId
        if (item.source !== 'manual') insert.source_type = item.source
        if (item.messageLink) insert.source_url = item.messageLink

        const { data: newTask, error: insertError } = await supabase
          .from('tasks')
          .insert(insert)
          .select()
          .single()
        if (insertError) throw insertError

        locallyCreatedIds.current.add(newTask.id)

        // Delete the old action_item row
        const { error: deleteError } = await supabase
          .from('action_items')
          .delete()
          .eq('id', id)
        if (deleteError) throw deleteError

        // Update local state with the new task ID
        setItems(prev => prev.map(i => i.id === id ? {
          ...i,
          id: newTask.id,
          origin: 'task' as const,
          title: newTask.title,
          description: newTask.description || '',
          status: newTask.status,
          goalId: newTask.goal_id || null,
          sourceType: newTask.source_type || undefined,
          sourceUrl: newTask.source_url || undefined,
          position: newTask.position ?? 0,
        } : i))

        return true
      } catch (error) {
        console.error('Error promoting action item to task:', error)
        setItems(prev => prev.map(i => i.id === id ? oldItem : i))
        return false
      }
    }

    // Regular task update
    setItems(prev => prev.map(i => i.id === id ? { ...i, title: data.title, description: data.description, goalId: data.goalId ?? i.goalId } : i))
    try {
      const updatePayload: Record<string, any> = { title: data.title, description: data.description }
      if (data.goalId !== undefined) updatePayload.goal_id = data.goalId
      const { error } = await supabase.from('tasks').update(updatePayload).eq('id', id)
      if (error) throw error
      return true
    } catch (error) {
      console.error('Error updating task:', error)
      setItems(prev => prev.map(i => i.id === id ? { ...i, title: item.title, description: item.description } : i))
      return false
    }
  }, [items, supabase, user])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/sync/action-items', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        console.error('Sync failed:', body)
      } else {
        await loadAllItems()
      }
    } catch (error) {
      console.error('Sync error:', error)
    } finally {
      setSyncing(false)
    }
  }

  const isItemOpen = (item: InboxItem) => {
    if (item.origin === 'action-item') return item.status === 'new'
    return item.status === 'active'
  }
  const openItems = items.filter(isItemOpen)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading inbox...</p>
      </div>
    )
  }

  return (
    <>
      <StickyHeader
        title="Inbox"
        byline={
          <p>
            {(() => {
              const hour = new Date().getHours()
              const greeting = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : 'Good evening'
              const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || ''
              const count = openItems.length
              const contextual = count === 0
                ? "You're all caught up."
                : count === 1
                  ? 'Just 1 issue to untangle.'
                  : `You have ${count} issues to untangle.`
              return `${greeting}${firstName ? `, ${firstName}` : ''}. ${contextual}`.trim()
            })()}
          </p>
        }
        actions={
          <button
            onClick={handleSync}
            disabled={syncing}
            className={cn(
              "shrink-0 p-2 rounded-md text-muted-foreground hover:text-primary transition-colors",
              syncing && "animate-spin"
            )}
            aria-label="Sync action items"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        }
      />

      {openItems.length > 0 ? (
        <div className="flex flex-col gap-3">
          {openItems.map((item) => (
            <InboxCard
              key={`${item.origin}-${item.id}`}
              item={item}
              isExpanded={expandedId === item.id}
              isExiting={exitingId === item.id}
              onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onDone={() => item.origin === 'action-item' ? handleActionItemDone(item.id) : handleTaskDone(item.id)}
              onSnooze={
                item.origin === 'task'
                  ? (until: Date) => handleTaskSnooze(item.id, until)
                  : () => handleActionItemSnooze(item.id)
              }
              onDelete={() => handleDelete(item.id, item.origin)}
              requireDeleteConfirm
              onEdit={() => {
                if (item.origin === 'task') {
                  setEditTask({
                    id: item.id,
                    title: item.title,
                    description: item.description,
                    metadata: item.metadata,
                    sourceType: item.sourceType,
                    sourceUrl: item.sourceUrl,
                    goalId: item.goalId,
                  })
                } else {
                  // Action item — open edit form; promotes to tasks table on save
                  setEditTask({
                    id: item.id,
                    title: item.title,
                    description: item.rawContext || '',
                    sourceType: item.source === 'manual' ? undefined : item.source,
                    sourceUrl: item.messageLink || undefined,
                    goalId: null,
                    _actionItemId: item.id,
                  })
                }
              }}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <img src="/inbox.svg" alt="" aria-hidden="true" className="h-20 w-20 opacity-40 mb-5" />
          <p className="text-lg font-semibold text-foreground mb-1">Summit reached.</p>
          <p className="text-muted-foreground text-sm max-w-[260px]">
            You have conquered today&apos;s action items.
          </p>
        </div>
      )}

      <KnotForm
        onSubmit={handleAddTask}
        onUpdate={handleUpdateTask}
        editTask={editTask}
        onEditClose={handleEditClose}
        contentColumnRef={contentColumnRef}
        goals={goals}
      />
    </>
  )
}

// --- Snooze Menu (shared) ---

const SNOOZE_OPTIONS = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
]

function SnoozeMenu({ onSnooze, onClose }: {
  onSnooze: (until: Date) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-1 min-w-[140px]">
      {SNOOZE_OPTIONS.map(({ label, days }) => (
        <button
          key={days}
          onClick={(e) => {
            e.stopPropagation()
            const d = new Date()
            d.setDate(d.getDate() + days)
            d.setHours(9, 0, 0, 0)
            onSnooze(d)
            onClose()
          }}
          className="w-full text-left px-3 py-1.5 text-sm text-foreground hover:bg-accent rounded transition-colors"
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// --- Unified Inbox Card ---

function InboxCard({ item, isExpanded, isExiting, onToggleExpand, onDone, onReopen, onSnooze, onDelete, onEdit, requireDeleteConfirm }: {
  item: InboxItem
  isExpanded: boolean
  isExiting: boolean
  onToggleExpand: () => void
  onDone?: () => void
  onReopen?: () => void
  onSnooze?: ((until: Date) => void) | (() => void)
  onDelete?: () => void
  onEdit?: () => void
  /** When true, first click shows confirm state; second click deletes */
  requireDeleteConfirm?: boolean
}) {
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDone = item.origin === 'action-item'
    ? (item.status === 'done' || item.status === 'dismissed')
    : item.status === 'completed'

  // Auto-clear confirm state after 3s
  useEffect(() => {
    if (confirmingDelete) {
      confirmTimer.current = setTimeout(() => setConfirmingDelete(false), 3000)
      return () => { if (confirmTimer.current) clearTimeout(confirmTimer.current) }
    }
  }, [confirmingDelete])

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (requireDeleteConfirm && !confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    onDelete?.()
  }

  return (
    <div
      className={cn(
        "group rounded-lg bg-card p-4 overflow-hidden transition-[background-color,opacity,transform] duration-200",
        !isExiting && "animate-in fade-in duration-300",
        !isDone && "hover:bg-accent-hover",
        isDone && "bg-accent-subtle opacity-75",
        isExiting && "animate-out fade-out slide-out-to-right duration-300 fill-mode-forwards",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Done/Reopen button */}
        {isDone ? (
          <button
            onClick={onReopen}
            className="mt-0.5 shrink-0 rounded-full w-5 h-5 border-2 border-primary bg-primary text-primary-foreground flex items-center justify-center transition-colors"
            aria-label="Reopen"
          >
            <Check className="h-3 w-3" />
          </button>
        ) : (
          <button
            onClick={onDone}
            className="mt-0.5 shrink-0 rounded-full w-5 h-5 border-2 border-muted-foreground/30 hover:border-primary flex items-center justify-center transition-colors"
            aria-label="Mark done"
          />
        )}

        {/* Content */}
        <div
          className="min-w-0 flex-1 cursor-pointer"
          onClick={() => {
            if (onEdit) {
              onEdit()
            } else {
              onToggleExpand()
            }
          }}
        >
          <p className={cn(
            "text-base font-semibold text-foreground break-words",
            isDone && "text-muted-foreground line-through decoration-muted-foreground/50"
          )}>
            {item.title}
          </p>

          {/* Description for task-origin items */}
          {item.origin === 'task' && item.description && (
            <p className={cn(
              "mt-1 text-sm text-muted-foreground break-words",
              isDone && "text-muted-foreground/70"
            )}>
              {item.description}
            </p>
          )}

          {/* Metadata row — origin-aware */}
          <InboxMetadataRow item={item} />

          {/* Expanded: raw context (action items only) */}
          {isExpanded && item.rawContext && (
            <div className="mt-3 p-3 rounded-md bg-accent text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {item.rawContext}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-0.5 relative">
          {/* Snooze button */}
          {!isDone && onSnooze && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (item.origin === 'task') {
                  setShowSnoozeMenu(!showSnoozeMenu)
                } else {
                  ;(onSnooze as () => void)()
                }
              }}
              className={cn(
                "shrink-0 p-1.5 rounded-md text-muted-foreground/50 hover:text-primary transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
                showSnoozeMenu && "sm:!opacity-100"
              )}
              aria-label="Snooze"
            >
              <Clock className="h-4 w-4" />
            </button>
          )}

          {showSnoozeMenu && item.origin === 'task' && (
            <SnoozeMenu
              onSnooze={(until) => (onSnooze as (until: Date) => void)(until)}
              onClose={() => setShowSnoozeMenu(false)}
            />
          )}

          {/* Delete button */}
          {onDelete && !confirmingDelete && (
            <button
              onClick={handleDeleteClick}
              className="shrink-0 p-1.5 rounded-md text-muted-foreground/50 hover:text-destructive transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {onDelete && confirmingDelete && (
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
    </div>
  )
}

// --- Metadata Row: shows origin icon + context + timestamp ---

function InboxMetadataRow({ item }: { item: InboxItem }) {
  if (item.source === 'manual') {
    // Manual tasks: clipboard icon + "Manually created" + timestamp
    return (
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        <ClipboardList className="h-3 w-3 text-muted-foreground/70 shrink-0" />
        <span className="text-xs text-muted-foreground/70">Manually created</span>
        {item.createdAt && (
          <>
            <span className="text-xs text-muted-foreground/40">&middot;</span>
            <span className="text-xs text-muted-foreground/70">{formatRelativeTime(item.createdAt)}</span>
          </>
        )}
      </div>
    )
  }

  if (item.origin === 'action-item') {
    // Action items from Slack/Granola: use inline icon + from + channel + time
    const SourceIcon = item.source === 'slack' ? MessageSquare : Video
    return (
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        {item.source === 'slack' ? (
          <img src="/slack-svgrepo-com.svg" alt="" className="h-3 w-3 shrink-0" aria-hidden="true" />
        ) : (
          <img src="/granola-icon.svg" alt="" className="h-3 w-3 shrink-0" aria-hidden="true" />
        )}
        {item.messageFrom && (
          <span className="text-xs text-muted-foreground">{item.messageFrom}</span>
        )}
        {item.sourceChannel && (
          <span className="text-xs text-muted-foreground">
            {item.messageFrom ? 'in' : ''} {item.sourceChannel}
          </span>
        )}
        {item.messageTimestamp && (
          <>
            <span className="text-xs text-muted-foreground/50">&middot;</span>
            <span className="text-xs text-muted-foreground">{formatRelativeTime(item.messageTimestamp)}</span>
          </>
        )}
      </div>
    )
  }

  // Task-origin items from Slack/Granola: use ProvenanceRow-style rendering
  if (item.source === 'slack' || item.source === 'granola') {
    // Try to get author name from metadata
    let authorName: string | undefined
    if (isSlackMetadata(item.metadata)) {
      authorName = item.metadata.source.author?.display_name
    } else if (isGranolaMetadata(item.metadata)) {
      authorName = item.metadata.source.author?.display_name
    }

    return (
      <ProvenanceRow
        sourceType={item.source}
        authorName={authorName}
        permalink={item.sourceUrl || item.messageLink || undefined}
        className="mt-1"
      />
    )
  }

  return null
}
