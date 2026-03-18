"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { SortableKnotList } from "@/components/sortable-knot-list"
import { KnotForm, type EditTask, type GoalOption } from "@/components/knot-form"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"
import { TaskMetadata } from "@/lib/types"

interface Knot {
  id: string
  title: string
  description: string
  status: "active" | "completed"
  position: number
  metadata?: TaskMetadata
  createdAt?: string
  sourceType?: string
  sourceUrl?: string
  goalId?: string | null
}

interface TasksTabProps {
  contentColumnRef: React.RefObject<HTMLDivElement | null>
}

export function TasksTab({ contentColumnRef }: TasksTabProps) {
  const { user } = useAuth()
  const [knots, setKnots] = useState<Knot[]>([])
  const [goals, setGoals] = useState<GoalOption[]>([])
  const [loading, setLoading] = useState(true)
  const [editTask, setEditTask] = useState<EditTask | null>(null)
  const [snoozingId, setSnoozingId] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [enteringId, setEnteringId] = useState<string | null>(null)
  const supabase = createClient()

  const locallyCreatedIds = useRef<Set<string>>(new Set())
  const locallyModifiedIds = useRef<Set<string>>(new Set())
  const isBatchOperation = useRef(false)
  const editTaskRef = useRef<EditTask | null>(null)
  useEffect(() => { editTaskRef.current = editTask }, [editTask])

  useEffect(() => {
    if (user) {
      loadKnots()
      loadGoals()
    }
  }, [user])

  // Reload goals when editing starts to include assigned (possibly completed) goal
  useEffect(() => {
    if (editTask?.goalId) {
      loadGoals(editTask.goalId)
    }
  }, [editTask])

  // Subscribe to real-time changes
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (isBatchOperation.current) return

          if (payload.eventType === 'INSERT') {
            const newTask = payload.new as any
            if (newTask.status === 'completed') return
            if (locallyCreatedIds.current.has(newTask.id)) {
              locallyCreatedIds.current.delete(newTask.id)
              return
            }

            const newKnot: Knot = {
              id: newTask.id,
              title: newTask.title,
              description: newTask.description || '',
              status: newTask.status,
              position: newTask.position ?? 0,
              metadata: newTask.metadata || undefined,
              createdAt: newTask.created_at,
              sourceType: newTask.source_type || undefined,
              sourceUrl: newTask.source_url || undefined,
              goalId: newTask.goal_id || null,
            }

            // Play slide-in animation for items arriving via realtime (e.g. from backlog)
            setEnteringId(newKnot.id)
            setTimeout(() => setEnteringId((cur) => cur === newKnot.id ? null : cur), 400)

            setKnots((prev) => {
              if (prev.some((k) => k.id === newKnot.id)) return prev
              const hasPositionConflict = prev.some(k => k.position === newKnot.position)
              if (hasPositionConflict) {
                const updated = prev.map(k =>
                  k.position >= newKnot.position ? { ...k, position: k.position + 1 } : k
                )
                return [newKnot, ...updated].sort((a, b) => a.position - b.position)
              } else {
                return [...prev, newKnot].sort((a, b) => a.position - b.position)
              }
            })
          } else if (payload.eventType === 'UPDATE') {
            const updatedTask = payload.new as any
            if (locallyModifiedIds.current.has(updatedTask.id)) {
              locallyModifiedIds.current.delete(updatedTask.id)
              return
            }
            setKnots((prev) => {
              const updated = prev.map((k) =>
                k.id === updatedTask.id
                  ? {
                      ...k,
                      title: updatedTask.title,
                      description: updatedTask.description || '',
                      status: updatedTask.status,
                      position: updatedTask.position ?? k.position,
                      metadata: updatedTask.metadata ?? k.metadata,
                      sourceType: updatedTask.source_type ?? k.sourceType,
                      sourceUrl: updatedTask.source_url ?? k.sourceUrl,
                    }
                  : k
              )
              return updated.sort((a, b) => a.position - b.position)
            })
          } else if (payload.eventType === 'DELETE') {
            const deletedTask = payload.old as any
            setKnots((prev) => prev.filter((k) => k.id !== deletedTask.id))
          }
        }
      )
      .subscribe()

    const goalsChannel = supabase
      .channel('tasks-goals-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals', filter: `user_id=eq.${user.id}` }, () => {
        loadGoals(editTaskRef.current?.goalId)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel); supabase.removeChannel(goalsChannel) }
  }, [user])

  const loadKnots = async () => {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', 'completed')
        .order('position', { ascending: true })

      if (error) throw error

      const formattedKnots: Knot[] = (data || []).map((task: any) => ({
        id: task.id,
        title: task.title,
        description: task.description || '',
        status: task.status as 'active' | 'completed',
        position: task.position ?? 0,
        metadata: task.metadata || undefined,
        createdAt: task.created_at,
        sourceType: task.source_type || undefined,
        sourceUrl: task.source_url || undefined,
        goalId: task.goal_id || null,
      }))
      setKnots(formattedKnots)
    } catch (error) {
      console.error('Error loading knots:', error)
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

  const handleToggle = async (id: string) => {
    const knot = knots.find((k) => k.id === id)
    if (!knot || !user) return
    const newStatus = knot.status === 'active' ? 'completed' : 'active'
    locallyModifiedIds.current.add(id)
    setKnots((prev) => prev.map((k) => k.id === id ? { ...k, status: newStatus } : k))

    if (newStatus === 'completed') {
      // Show completed state briefly, then move to backlog as resolved
      setCompletingId(id)
      try {
        // Insert into backlog as resolved
        const { error: insertError } = await supabase.from('backlog').insert({
          title: knot.title,
          description: knot.description,
          category: 'action',
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          user_id: user.id,
          position: 0,
          source_type: knot.sourceType || null,
          goal_id: knot.goalId || null,
          original_created_at: knot.createdAt || null,
        })
        if (insertError) throw insertError

        // Animate out immediately (same as snooze), then delete from tasks
        setSnoozingId(id)
        setTimeout(async () => {
          setCompletingId(null)
          setSnoozingId(null)
          setKnots((prev) => prev.filter((k) => k.id !== id))
          try {
            const { error: deleteError } = await supabase.from('tasks').delete().eq('id', id)
            if (deleteError) throw deleteError
          } catch (error) {
            console.error('Error deleting completed task:', error)
            loadKnots()
          }
        }, 300) // slide-out animation duration
      } catch (error) {
        console.error('Error moving completed task to backlog:', error)
        setCompletingId(null)
        locallyModifiedIds.current.delete(id)
        setKnots((prev) => prev.map((k) => k.id === id ? { ...k, status: knot.status } : k))
      }
    } else {
      // Uncompleting - simple toggle
      try {
        const { error } = await supabase
          .from('tasks')
          .update({ status: newStatus, completed_at: null })
          .eq('id', id)
        if (error) throw error
      } catch (error) {
        console.error('Error toggling knot:', error)
        locallyModifiedIds.current.delete(id)
        setKnots((prev) => prev.map((k) => k.id === id ? { ...k, status: knot.status } : k))
      }
    }
  }

  const handleDelete = async (id: string) => {
    setKnots((prev) => prev.filter((knot) => knot.id !== id))
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    } catch (error) {
      console.error('Error deleting knot:', error)
      loadKnots()
    }
  }

  const handleReorder = async (reorderedKnots: Knot[]) => {
    const previousKnots = knots
    isBatchOperation.current = true
    const knotsWithPositions = reorderedKnots.map((knot, index) => ({ ...knot, position: index }))
    setKnots(knotsWithPositions)
    try {
      const updates = knotsWithPositions.map((knot) =>
        supabase.from('tasks').update({ position: knot.position }).eq('id', knot.id)
      )
      const results = await Promise.all(updates)
      const errors = results.filter((r) => r.error)
      if (errors.length > 0) throw new Error(`Failed to update ${errors.length} task positions`)
    } catch (error) {
      console.error('Error reordering knots:', error)
      setKnots(previousKnots)
    } finally {
      setTimeout(() => { isBatchOperation.current = false }, 1000)
    }
  }

  const handleAddKnot = async (data: { title: string; description: string; goalId?: string | null }) => {
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
      const newKnot: Knot = {
        id: newTask.id,
        title: newTask.title,
        description: newTask.description || '',
        status: newTask.status,
        position: newTask.position ?? 0,
        metadata: newTask.metadata || undefined,
        createdAt: newTask.created_at,
      }
      locallyCreatedIds.current.add(newKnot.id)
      setKnots((prev) => {
        const shifted = prev.map(k => ({ ...k, position: k.position + 1 }))
        return [newKnot, ...shifted]
      })
    } catch (error) {
      console.error('Error adding knot:', error)
    }
  }

  const handleEdit = useCallback((id: string) => {
    const knot = knots.find((k) => k.id === id)
    if (knot) {
      setEditTask({
        id: knot.id,
        title: knot.title,
        description: knot.description,
        metadata: knot.metadata,
        sourceType: knot.sourceType,
        sourceUrl: knot.sourceUrl,
        goalId: knot.goalId,
      })
    }
  }, [knots])

  const handleEditClose = useCallback(() => { setEditTask(null) }, [])

  const handleUpdateKnot = useCallback(async (id: string, data: { title: string; description: string; goalId?: string | null }): Promise<boolean> => {
    const knot = knots.find((k) => k.id === id)
    if (!knot) return false
    locallyModifiedIds.current.add(id)
    setKnots((prev) => prev.map((k) => k.id === id ? { ...k, title: data.title, description: data.description, goalId: data.goalId ?? k.goalId } : k))
    try {
      const updatePayload: Record<string, any> = { title: data.title, description: data.description }
      if (data.goalId !== undefined) {
        updatePayload.goal_id = data.goalId
      }
      const { error } = await supabase.from('tasks').update(updatePayload).eq('id', id)
      if (error) throw error
      if (data.goalId !== undefined && data.goalId !== knot.goalId) {
      }
      return true
    } catch (error) {
      console.error('Error updating knot:', error)
      locallyModifiedIds.current.delete(id)
      setKnots((prev) => prev.map((k) => k.id === id ? { ...k, title: knot.title, description: knot.description, goalId: knot.goalId } : k))
      return false
    }
  }, [knots, supabase])

  const handleSnooze = async (id: string, until: Date) => {
    const knot = knots.find((k) => k.id === id)
    if (!knot || !user) return

    // Play exit animation, then remove from list and persist
    setSnoozingId(id)

    setTimeout(async () => {
      setSnoozingId(null)
      setKnots((prev) => prev.filter((k) => k.id !== id))

      try {
        // Insert into backlog with snooze date, preserving original created_at
        const { error: insertError } = await supabase.from('backlog').insert({
          title: knot.title,
          description: knot.description,
          category: 'action',
          user_id: user.id,
          position: 0,
          snoozed_until: until.toISOString(),
          source_type: knot.sourceType || null,
          goal_id: knot.goalId || null,
          ...(knot.createdAt ? { created_at: knot.createdAt } : {}),
        })
        if (insertError) throw insertError

        // Delete from tasks
        const { error: deleteError } = await supabase.from('tasks').delete().eq('id', id)
        if (deleteError) throw deleteError

      } catch (error) {
        console.error('Error snoozing task:', error)
        loadKnots() // Rollback
      }
    }, 300) // Match animation duration
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading your knots...</p>
      </div>
    )
  }

  return (
    <>
      <header className="mb-10 md:mb-12">
        <h1 className="mb-2 text-2xl font-bold text-foreground">My Knots</h1>
        <p className="text-muted-foreground">What you meant to come back to.</p>
      </header>

      {knots.length > 0 ? (
        <SortableKnotList
          knots={knots}
          onReorder={handleReorder}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onEdit={handleEdit}
          onSnooze={handleSnooze}
          snoozingId={snoozingId}
          enteringId={enteringId}
        />
      ) : (
        <p className="py-8 text-center text-muted-foreground">
          No knots to track. Add some to get started!
        </p>
      )}

      <KnotForm
        onSubmit={handleAddKnot}
        onUpdate={handleUpdateKnot}
        editTask={editTask}
        onEditClose={handleEditClose}
        contentColumnRef={contentColumnRef}
        goals={goals}
      />
    </>
  )
}
