"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"
import { useRealtimeChannel } from "@/hooks/use-realtime-channel"
import { cn, formatRelativeTime } from "@/lib/utils"
import { Check, Target, MessageSquare, Video, RefreshCw, Clock, ClipboardList, Search, ArrowDownNarrowWide, ArrowUpNarrowWide, X, ChevronRight } from "lucide-react"
import { KnotForm, type EditTask, type GoalOption } from "@/components/knot-form"
import { ProvenanceRow } from "@/components/ui/provenance-row"
import { TaskMetadata, isSlackMetadata, isGranolaMetadata } from "@/lib/types"
import { prepareTaskForListView, detectSlackTask } from "@/lib/text-utils"
import { StickyHeader } from "@/components/sticky-header"
import { CardActionGroup, cardActionMutedClass } from "@/components/ui/card-action-group"

/** Strip "Source: https://..." from text — handles trailing, inline, and newline-prefixed */
function stripSourceSuffix(text: string): string {
  return text
    .replace(/[\s.]*Source:\s*https?:\/\/\S+/gi, '')
    .trim()
}

/** Detect Gmail from message link URL */
function isGmailLink(url: string | null): boolean {
  if (!url) return false
  try {
    return new URL(url).hostname === 'mail.google.com'
  } catch {
    return url.includes('mail.google.com')
  }
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
  source: 'slack' | 'granola' | 'gmail' | 'notetaker' | 'manual'
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
  mondayItemId?: string | null
}

interface ActionItemsTabProps {
  contentColumnRef: React.RefObject<HTMLDivElement | null>
  isActive?: boolean
}

export function ActionItemsTab({ contentColumnRef, isActive }: ActionItemsTabProps) {
  const { user } = useAuth()
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{ type: 'error' | 'warning'; text: string } | null>(null)
  // filterSource removed — origin is already shown in card metadata footer
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [exitingId, setExitingId] = useState<string | null>(null)
  const [goals, setGoals] = useState<GoalOption[]>([])
  const [editTask, setEditTask] = useState<EditTask | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [searchFocused, setSearchFocused] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
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

  // Reload when tab becomes active (catches unsnooze/move-to-tasks changes from other tabs)
  useEffect(() => {
    if (isActive && user) loadAllItems()
  }, [isActive])

  // Reload goals when editing starts to include assigned (possibly completed) goal
  useEffect(() => {
    if (editTask?.goalId) {
      loadGoals(editTask.goalId)
    }
  }, [editTask])

  // Real-time subscriptions (pause when tab is hidden to avoid inflated iOS Screen Time)
  useRealtimeChannel(
    'inbox-action-items-changes',
    { table: 'action_items', filter: `user_id=eq.${user?.id}` },
    () => { loadAllItems() },
  )

  useRealtimeChannel(
    'inbox-tasks-changes',
    { table: 'tasks', filter: `user_id=eq.${user?.id}` },
    (payload: any) => {
      if (payload?.eventType === 'INSERT') {
        const newTask = payload.new as any
        if (locallyCreatedIds.current.has(newTask.id)) {
          locallyCreatedIds.current.delete(newTask.id)
          return
        }
      }
      loadAllItems()
    },
  )

  useRealtimeChannel(
    'inbox-goals-changes',
    { table: 'goals', filter: `user_id=eq.${user?.id}` },
    () => { loadGoals(editTaskRef.current?.goalId) },
  )

  const loadAllItems = async () => {
    if (!user) return
    try {
      // Load both tables in parallel
      const [actionResult, tasksResult] = await Promise.all([
        supabase
          .from('action_items')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'new')
          .order('message_timestamp', { ascending: false, nullsFirst: false }),
        supabase
          .from('tasks')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('position', { ascending: true }),
      ])

      if (actionResult.error) throw actionResult.error
      if (tasksResult.error) throw tasksResult.error

      const actionItems: InboxItem[] = (actionResult.data || []).map((row: any) => {
        // Infer gmail from link when DB source column says slack
        let source: InboxItem['source'] = row.source as 'slack' | 'granola' | 'gmail' | 'notetaker'
        if (source === 'slack' && isGmailLink(row.message_link)) {
          source = 'gmail'
        }
        return {
          id: row.id,
          origin: 'action-item' as const,
          title: stripSourceSuffix(row.action_item),
          description: '',
          source,
          sourceChannel: row.source_channel,
          messageFrom: row.message_from,
          messageLink: row.message_link,
          createdAt: row.created_at,
          messageTimestamp: row.message_timestamp,
          status: row.status,
          rawContext: row.raw_context,
          mondayItemId: row.monday_item_id || null,
        }
      })

      const taskItems: InboxItem[] = (tasksResult.data || []).map((row: any) => {
        // Determine source for tasks
        let source: 'slack' | 'granola' | 'gmail' | 'notetaker' | 'manual' = 'manual'
        if (row.source_type === 'slack') source = 'slack'
        else if (row.source_type === 'granola') source = 'granola'
        else if (row.source_type === 'gmail') source = 'gmail'
        else if (row.source_type === 'notetaker') source = 'notetaker'
        else if (row.metadata?.source?.type === 'slack') source = 'slack'
        else if (row.metadata?.source?.type === 'granola') source = 'granola'
        else if (row.metadata?.source?.type === 'gmail') source = 'gmail'

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
    if (!item || item.origin !== 'action-item' || !user) return

    // Animate out then move to backlog as completed
    setExitingId(id)
    try {
      const { error: insertError } = await supabase.from('backlog').insert({
        title: item.title,
        description: item.rawContext || '',
        category: 'action',
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        user_id: user.id,
        position: 0,
        source_type: item.source === 'manual' ? null : item.source,
        original_created_at: item.createdAt || null,
      })
      if (insertError) throw insertError

      setTimeout(async () => {
        setExitingId(null)
        setItems(prev => prev.filter(i => i.id !== id))
        try {
          const { error } = await supabase
            .from('action_items')
            .update({ status: 'done' })
            .eq('id', id)
          if (error) throw error
          // Fire-and-forget Monday status update
          if (item.mondayItemId) {
            fetch('/api/monday/update-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mondayItemId: item.mondayItemId, status: 'Done' }),
            }).catch(err => console.error('Monday status update failed:', err))
          }
        } catch (error) {
          console.error('Error completing action item:', error)
          loadAllItems()
        }
      }, 300)
    } catch (error) {
      console.error('Error completing action item:', error)
      setExitingId(null)
    }
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
        // Fire-and-forget Monday status update
        if (item.mondayItemId) {
          fetch('/api/monday/update-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mondayItemId: item.mondayItemId, status: 'Dismissed' }),
          }).catch(err => console.error('Monday status update failed:', err))
        }
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
        source_type: item.sourceType || null,
        goal_id: item.goalId || null,
        original_created_at: item.createdAt || null,
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
          source_type: item.sourceType || null,
          goal_id: item.goalId || null,
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

  const handleActionItemSnooze = async (id: string, until: Date) => {
    const item = items.find(i => i.id === id)
    if (!item || item.origin !== 'action-item' || !user) return

    setExitingId(id)

    setTimeout(async () => {
      setExitingId(null)
      setItems(prev => prev.filter(i => i.id !== id))

      try {
        // Insert into backlog with snooze date
        const { error: insertError } = await supabase.from('backlog').insert({
          title: item.title,
          description: item.rawContext || '',
          category: 'action',
          user_id: user.id,
          position: 0,
          snoozed_until: until.toISOString(),
          source_type: item.source === 'manual' ? null : item.source,
          ...(item.createdAt ? { created_at: item.createdAt } : {}),
        })
        if (insertError) throw insertError

        // Delete from action_items
        const { error: deleteError } = await supabase
          .from('action_items')
          .delete()
          .eq('id', id)
        if (deleteError) throw deleteError
      } catch (error) {
        console.error('Error snoozing action item:', error)
        loadAllItems()
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
    const item = items.find(i => i.id === id)
    setItems(prev => prev.filter(i => i.id !== id))
    try {
      // Soft-delete: mark as dismissed so monday_item_id stays for dedup
      const { error } = await supabase.from('action_items').update({ status: 'dismissed' }).eq('id', id)
      if (error) throw error
      // Fire-and-forget Monday status update
      if (item?.mondayItemId) {
        fetch('/api/monday/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mondayItemId: item.mondayItemId, status: 'Dismissed' }),
        }).catch(err => console.error('Monday status update failed:', err))
      }
    } catch (error) {
      console.error('Error deleting action item:', error)
      loadAllItems()
    }
  }

  const handleDelete = (id: string, origin: InboxOrigin) => {
    if (origin === 'task') handleTaskDelete(id)
    else handleActionItemDelete(id)
  }

  // --- Convert to Goal ---

  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMessage(null), 3000)
  }

  /** Get the upcoming Friday (or today if already Friday) */
  const getUpcomingFriday = () => {
    const d = new Date()
    const day = d.getDay() // 0=Sun, 5=Fri
    const diff = day <= 5 ? 5 - day : 5 + 7 - day
    d.setDate(d.getDate() + (diff === 0 ? 0 : diff))
    return d.toISOString().split('T')[0] // YYYY-MM-DD
  }

  const handleConvertToGoal = async (id: string, origin: InboxOrigin) => {
    const item = items.find(i => i.id === id)
    if (!item || !user) return

    // Animate out
    setExitingId(id)

    setTimeout(async () => {
      setExitingId(null)
      setItems(prev => prev.filter(i => i.id !== id))

      try {
        // Create goal with mapped data
        const { error: goalError } = await supabase.from('goals').insert({
          title: item.title,
          description: item.description || '',
          priority: 2, // P1
          deadline: getUpcomingFriday(),
          risks: '',
          user_id: user.id,
          position: 0,
        })
        if (goalError) throw goalError

        // Delete original item from its source table
        if (origin === 'task') {
          const { error } = await supabase.from('tasks').delete().eq('id', id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('action_items').delete().eq('id', id)
          if (error) throw error
        }

        showToast('Converted to P1 Goal.')
      } catch (error) {
        console.error('Error converting to goal:', error)
        loadAllItems()
      }
    }, 300)
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

  const handleRestoreFromModal = useCallback(async (id: string): Promise<boolean> => {
    const item = items.find(i => i.id === id)
    if (!item) return false
    const oldStatus = item.status

    if (item.origin === 'action-item') {
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'new' } : i))
      try {
        const { error } = await supabase.from('action_items').update({ status: 'new' }).eq('id', id)
        if (error) throw error
        return true
      } catch (err) {
        console.error('Error restoring action item:', err)
        setItems(prev => prev.map(i => i.id === id ? { ...i, status: oldStatus } : i))
        return false
      }
    } else {
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'active' } : i))
      try {
        const { error } = await supabase.from('tasks').update({ status: 'active', resolved_at: null }).eq('id', id)
        if (error) throw error
        return true
      } catch (err) {
        console.error('Error restoring task:', err)
        setItems(prev => prev.map(i => i.id === id ? { ...i, status: oldStatus } : i))
        return false
      }
    }
  }, [items, supabase])

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
    setSyncMessage(null)
    try {
      const res = await fetch('/api/sync/action-items', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        console.error('Sync failed:', body)
        setSyncMessage({ type: 'error', text: body.error || 'Sync failed' })
      } else {
        const result = await res.json()
        if (result.failed > 0) {
          setSyncMessage({ type: 'warning', text: result.message || `${result.failed} item(s) failed to sync` })
        }
        await loadAllItems()
      }
    } catch (error) {
      console.error('Sync error:', error)
      setSyncMessage({ type: 'error', text: 'Could not reach sync service' })
    } finally {
      setSyncing(false)
    }
  }

  const isItemOpen = (item: InboxItem) => {
    if (item.origin === 'action-item') return item.status === 'new'
    return item.status === 'active'
  }
  const openItems = items.filter(isItemOpen)

  const filteredItems = useMemo(() => {
    let result = openItems
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(item =>
        item.title.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q))
      )
    }
    result = [...result].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime()
      const dateB = new Date(b.createdAt).getTime()
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB
    })
    return result
  }, [openItems, searchQuery, sortOrder])

  const isSearchActive = searchFocused || searchQuery.length > 0

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
      />

      {openItems.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search inbox..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="w-full h-9 pl-9 pr-8 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/20"
            />
            {searchQuery.length > 0 && (
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => { setSearchQuery(''); searchInputRef.current?.focus() }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {isSearchActive ? (
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                setSearchQuery('')
                setSearchFocused(false)
                searchInputRef.current?.blur()
              }}
              className="shrink-0 text-sm font-medium text-muted-foreground hover:text-primary transition-colors px-1"
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                onClick={() => setSortOrder(s => s === 'desc' ? 'asc' : 'desc')}
                className="shrink-0 p-2 rounded-md text-muted-foreground hover:text-primary transition-colors"
                aria-label={sortOrder === 'desc' ? 'Sorted newest first' : 'Sorted oldest first'}
              >
                {sortOrder === 'desc' ? <ArrowDownNarrowWide className="h-5 w-5" /> : <ArrowUpNarrowWide className="h-5 w-5" />}
              </button>
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
            </>
          )}
        </div>
      )}

      {syncMessage && (
        <div className={cn(
          "px-3 py-2 rounded-md text-sm mb-2",
          syncMessage.type === 'error' ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-700"
        )}>
          {syncMessage.text}
        </div>
      )}

      {filteredItems.length > 0 ? (
        <div className="flex flex-col gap-3 max-w-3xl">
          {filteredItems.map((item) => (
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
                  : (until: Date) => handleActionItemSnooze(item.id, until)
              }
              onConvertToGoal={() => handleConvertToGoal(item.id, item.origin)}
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
                    status: item.status as EditTask['status'],
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
                    status: item.status as EditTask['status'],
                    _actionItemId: item.id,
                  })
                }
              }}
            />
          ))}
        </div>
      ) : openItems.length > 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <img src="/search.svg" alt="" aria-hidden="true" className="h-20 w-20 opacity-40 mb-5" />
          <p className="text-sm font-medium text-foreground">No matching items</p>
          <p className="text-sm text-muted-foreground mt-1">Try adjusting your search terms.</p>
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

      {openItems.length > 0 && (
        <p className="text-center text-xs text-slate-400 mt-8 mb-4">
          Powered by knots.bot
        </p>
      )}

      <KnotForm
        onSubmit={handleAddTask}
        onUpdate={handleUpdateTask}
        onRestore={handleRestoreFromModal}
        editTask={editTask}
        onEditClose={handleEditClose}
        contentColumnRef={contentColumnRef}
        goals={goals}
      />

      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
          {toastMessage}
        </div>
      )}
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

function InboxCard({ item, isExpanded, isExiting, onToggleExpand, onDone, onReopen, onSnooze, onConvertToGoal, onEdit }: {
  item: InboxItem
  isExpanded: boolean
  isExiting: boolean
  onToggleExpand: () => void
  onDone?: () => void
  onReopen?: () => void
  onSnooze?: (until: Date) => void
  onConvertToGoal?: () => void
  onEdit?: () => void
}) {
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false)
  const [isConfirmingConvert, setIsConfirmingConvert] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const convertBtnRef = useRef<HTMLButtonElement>(null)
  const convertBtnMobileRef = useRef<HTMLButtonElement>(null)
  const isDone = item.origin === 'action-item'
    ? (item.status === 'done' || item.status === 'dismissed')
    : item.status === 'completed'

  // Auto-reset confirm state after 3s
  useEffect(() => {
    if (isConfirmingConvert) {
      confirmTimer.current = setTimeout(() => setIsConfirmingConvert(false), 3000)
      return () => { if (confirmTimer.current) clearTimeout(confirmTimer.current) }
    }
  }, [isConfirmingConvert])

  // Blur-reset: clicking outside the convert button resets confirm state
  useEffect(() => {
    if (!isConfirmingConvert) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      const insideDesktop = convertBtnRef.current?.contains(target)
      const insideMobile = convertBtnMobileRef.current?.contains(target)
      if (!insideDesktop && !insideMobile) {
        setIsConfirmingConvert(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isConfirmingConvert])

  const handleConvertClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isConfirmingConvert) {
      setIsConfirmingConvert(true)
      return
    }
    onConvertToGoal?.()
  }

  return (
    <div
      className={cn(
        "group relative rounded-lg bg-card px-6 py-4 transition-[background-color,opacity,transform] duration-200",
        !isExiting && "animate-in fade-in duration-300",
        !isDone && "hover:bg-accent-hover",
        isDone && "bg-accent-subtle opacity-75",
        isExiting && "animate-out fade-out slide-out-to-right duration-300 fill-mode-forwards overflow-hidden",
        showSnoozeMenu && "z-10",
      )}
    >
      <div className="flex items-start gap-3 md:gap-4">
        {/* Done/Reopen button */}
        {isDone ? (
          <button
            onClick={onReopen}
            className="mt-[3px] shrink-0 rounded-full w-5 h-5 border-2 border-primary bg-primary text-primary-foreground flex items-center justify-center transition-colors"
            aria-label="Reopen"
          >
            <Check className="h-3 w-3" />
          </button>
        ) : (
          <button
            onClick={onDone}
            className="mt-[3px] shrink-0 rounded-full w-5 h-5 border-2 border-muted-foreground/30 hover:border-primary flex items-center justify-center transition-colors"
            aria-label="Mark done"
          />
        )}

        {/* Content */}
        <div
          className="min-w-0 flex-1 md:pr-12 cursor-pointer"
          onClick={() => {
            if (onEdit) {
              onEdit()
            } else {
              onToggleExpand()
            }
          }}
        >
          <p className={cn(
            "text-base font-semibold leading-snug text-foreground break-words",
            isDone && "text-muted-foreground line-through decoration-muted-foreground/50"
          )}>
            {item.title}
          </p>

          {/* Description for task-origin items */}
          {item.origin === 'task' && item.description && (
            <p className={cn(
              "mt-1 text-sm text-muted-foreground break-words line-clamp-2",
              isDone && "text-muted-foreground/70"
            )}>
              {item.description}
            </p>
          )}

          {/* Metadata row + mobile action icons */}
          <div className="flex items-center mt-2">
            <div className="flex-1 min-w-0">
              <InboxMetadataRow item={item} />
            </div>
            {/* Mobile inline icons — sit on metadata row, hidden on desktop */}
            {!isDone && (
              <div className="flex md:hidden shrink-0 items-center gap-0.5 ml-2 relative">
                {onSnooze && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowSnoozeMenu(!showSnoozeMenu) }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label="Snooze"
                  >
                    <Clock className="h-4 w-4" />
                  </button>
                )}
                {onConvertToGoal && !isConfirmingConvert && (
                  <button
                    onClick={handleConvertClick}
                    className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label="Convert to goal"
                  >
                    <Target className="h-4 w-4" />
                  </button>
                )}
                {showSnoozeMenu && onSnooze && (
                  <SnoozeMenu
                    onSnooze={(until) => onSnooze(until)}
                    onClose={() => setShowSnoozeMenu(false)}
                  />
                )}
              </div>
            )}
          </div>

          {/* Mobile-only "Create Goal?" full-width confirmation */}
          {onConvertToGoal && isConfirmingConvert && (
            <button
              ref={convertBtnMobileRef}
              onClick={handleConvertClick}
              className="md:hidden w-full mt-4 flex items-center justify-between p-3 rounded-xl bg-slate-50 text-sm font-medium text-foreground transition-colors"
              aria-label="Confirm convert to goal"
            >
              Create Goal?
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          )}

          {/* Expanded: raw context (action items only) */}
          {isExpanded && item.rawContext && (
            <div className="mt-3 p-3 rounded-md bg-accent text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {item.rawContext}
            </div>
          )}
        </div>

        {/* Action buttons — desktop only */}
        <CardActionGroup className="hidden md:flex">
          {/* Snooze button */}
          {!isDone && onSnooze && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowSnoozeMenu(!showSnoozeMenu)
              }}
              className={cn(
                cardActionMutedClass,
                showSnoozeMenu && "sm:!opacity-100"
              )}
              aria-label="Snooze"
            >
              <Clock className="h-5 w-5" />
            </button>
          )}

          {showSnoozeMenu && onSnooze && (
            <SnoozeMenu
              onSnooze={(until) => onSnooze(until)}
              onClose={() => setShowSnoozeMenu(false)}
            />
          )}

          {/* Convert to Goal button */}
          {onConvertToGoal && !isConfirmingConvert && (
            <button
              onClick={handleConvertClick}
              className={cardActionMutedClass}
              aria-label="Convert to goal"
            >
              <Target className="h-5 w-5" />
            </button>
          )}
          {onConvertToGoal && isConfirmingConvert && (
            <button
              ref={convertBtnRef}
              onClick={handleConvertClick}
              className="shrink-0 px-2 py-1 rounded-md text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
              aria-label="Confirm convert to goal"
            >
              Create Goal?
            </button>
          )}
        </CardActionGroup>
      </div>
    </div>
  )
}

// --- Metadata Row: shows origin icon + context + timestamp ---

function InboxMetadataRow({ item }: { item: InboxItem }) {
  if (item.source === 'manual') {
    // Manual tasks: clipboard icon + "Manually created" + timestamp
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
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
    // Action items from Slack/Granola/Gmail: use inline icon + from + channel + time
    const sourceIcon = item.source === 'slack'
      ? '/slack-svgrepo-com.svg'
      : item.source === 'gmail'
        ? '/gmail.svg'
        : item.source === 'notetaker'
          ? '/monday-icon.svg'
          : '/granola-icon.svg'
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <img src={sourceIcon} alt="" className="h-3 w-3 shrink-0" aria-hidden="true" />
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

  // Task-origin items from Slack/Granola/Gmail: use ProvenanceRow-style rendering
  if (item.source === 'slack' || item.source === 'granola' || item.source === 'gmail' || item.source === 'notetaker') {
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
        className=""
      />
    )
  }

  return null
}
