"use client"

import { useState, useEffect, useRef } from "react"
import KnotCard from "@/components/knot-card" // Import KnotCard component
import { SortableKnotList } from "@/components/sortable-knot-list"
import { KnotForm } from "@/components/knot-form"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"
import { SignIn } from "@/components/auth/sign-in"
import { Unauthorized } from "@/components/auth/unauthorized"
import { HamburgerMenu } from "@/components/hamburger-menu"
import { ResetPassword } from "@/components/auth/reset-password"

interface Knot {
  id: string
  title: string
  description: string
  status: "active" | "completed"
  position: number
}

export default function Page() {
  const { user, loading: authLoading, isAuthorized, isPasswordRecovery, clearPasswordRecovery } = useAuth()
  const [knots, setKnots] = useState<Knot[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  // Track IDs of items being modified locally to prevent conflicts with real-time subscription
  // This fixes race conditions in Safari PWA where both local state update and
  // real-time subscription can process the same item before React batches the updates
  const locallyCreatedIds = useRef<Set<string>>(new Set())
  const locallyModifiedIds = useRef<Set<string>>(new Set())

  // Track if we're currently doing a batch operation (like reorder)
  const isBatchOperation = useRef(false)

  // Load knots from Supabase on mount
  useEffect(() => {
    if (user && isAuthorized) {
      loadKnots()
    }
  }, [user, isAuthorized])

  // Subscribe to real-time changes
  useEffect(() => {
    if (!user || !isAuthorized) return

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
          // Skip all real-time events during batch operations (like reorder)
          // This prevents Safari PWA from processing our own UPDATE events
          if (isBatchOperation.current) {
            return
          }

          if (payload.eventType === 'INSERT') {
            const newTask = payload.new as any

            // Skip if this item was created locally (already added via handleAddKnot)
            // This prevents duplicates in Safari PWA where the real-time event
            // can arrive before React finishes batching the local state update
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
            }

            // Add new knot if it doesn't already exist (cross-tab sync)
            // Insert at correct position and re-sort
            setKnots((prev) => {
              if (prev.some((k) => k.id === newKnot.id)) return prev
              // Update positions of existing knots (they were shifted by the server trigger)
              const updated = prev.map(k => ({ ...k, position: k.position + 1 }))
              return [newKnot, ...updated].sort((a, b) => a.position - b.position)
            })
          } else if (payload.eventType === 'UPDATE') {
            const updatedTask = payload.new as any

            // Skip if this item is being modified locally
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
                    }
                  : k
              )
              // Re-sort by position to handle reorder updates
              return updated.sort((a, b) => a.position - b.position)
            })
          } else if (payload.eventType === 'DELETE') {
            const deletedTask = payload.old as any
            setKnots((prev) => prev.filter((k) => k.id !== deletedTask.id))
          }
        }
      )
      .subscribe()

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, isAuthorized])

  const loadKnots = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('position', { ascending: true })

      if (error) throw error

      const formattedKnots: Knot[] = (data || []).map((task: any) => ({
        id: task.id,
        title: task.title,
        description: task.description || '',
        status: task.status as 'active' | 'completed',
        position: task.position ?? 0,
      }))

      setKnots(formattedKnots)
    } catch (error) {
      console.error('Error loading knots:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (id: string) => {
    const knot = knots.find((k) => k.id === id)
    if (!knot) return

    const newStatus = knot.status === 'active' ? 'completed' : 'active'

    // Mark as locally modified to ignore real-time UPDATE event
    locallyModifiedIds.current.add(id)

    // Optimistic update (preserve position)
    setKnots((prev) =>
      prev.map((k) =>
        k.id === id ? { ...k, status: newStatus } : k
      )
    )

    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: newStatus,
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
        })
        .eq('id', id)

      if (error) throw error
    } catch (error) {
      console.error('Error toggling knot:', error)
      // Revert on error (preserve position)
      locallyModifiedIds.current.delete(id)
      setKnots((prev) =>
        prev.map((k) =>
          k.id === id ? { ...k, status: knot.status } : k
        )
      )
    }
  }

  const handleDelete = async (id: string) => {
    // Optimistic update
    setKnots((prev) => prev.filter((knot) => knot.id !== id))

    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id)

      if (error) throw error
    } catch (error) {
      console.error('Error deleting knot:', error)
      // Reload on error
      loadKnots()
    }
  }

  const handleReorder = async (reorderedKnots: Knot[]) => {
    // Store previous state for rollback
    const previousKnots = knots

    // Mark as batch operation to ignore real-time events for our own updates
    // This prevents Safari PWA from duplicating items when processing UPDATE events
    isBatchOperation.current = true

    // Update positions based on new order
    const knotsWithPositions = reorderedKnots.map((knot, index) => ({
      ...knot,
      position: index,
    }))

    // Optimistic update
    setKnots(knotsWithPositions)

    try {
      // Persist all position changes to database
      // Use Promise.all to update all positions efficiently
      const updates = knotsWithPositions.map((knot) =>
        supabase
          .from('tasks')
          .update({ position: knot.position })
          .eq('id', knot.id)
      )

      const results = await Promise.all(updates)

      // Check for any errors
      const errors = results.filter((r) => r.error)
      if (errors.length > 0) {
        throw new Error(`Failed to update ${errors.length} task positions`)
      }
    } catch (error) {
      console.error('Error reordering knots:', error)
      // Rollback on error
      setKnots(previousKnots)
    } finally {
      // Clear batch operation flag after a delay to ensure all real-time events
      // from our updates have been received and ignored
      setTimeout(() => {
        isBatchOperation.current = false
      }, 1000)
    }
  }

  const handleAddKnot = async (data: { title: string; description: string }) => {
    if (!user) return

    try {
      const { data: newTask, error } = await supabase
        .from('tasks')
        .insert({
          title: data.title,
          description: data.description,
          status: 'active',
          user_id: user.id,
          position: 0, // New tasks go to top
        })
        .select()
        .single()

      if (error) throw error

      const newKnot: Knot = {
        id: newTask.id,
        title: newTask.title,
        description: newTask.description || '',
        status: newTask.status,
        position: newTask.position ?? 0,
      }

      // Mark as locally created BEFORE updating state
      // This prevents the real-time subscription from adding a duplicate
      locallyCreatedIds.current.add(newKnot.id)

      // Add at top and shift other positions (server trigger handles DB side)
      setKnots((prev) => {
        const shifted = prev.map(k => ({ ...k, position: k.position + 1 }))
        return [newKnot, ...shifted]
      })
    } catch (error) {
      console.error('Error adding knot:', error)
    }
  }

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <main className="min-h-screen bg-background px-4 py-12">
        <div className="mx-auto max-w-xl">
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </main>
    )
  }

  // Show sign-in page if not authenticated
  if (!user) {
    return <SignIn />
  }

  // Show password reset form if in recovery mode (must have session first)
  if (isPasswordRecovery) {
    return <ResetPassword onComplete={clearPasswordRecovery} />
  }

  // Show unauthorized page if user email is not whitelisted
  if (!isAuthorized) {
    return <Unauthorized />
  }

  // Show loading state while fetching knots
  if (loading) {
    return (
      <main className="min-h-screen bg-background px-4 py-12">
        <div className="mx-auto max-w-xl">
          <div className="flex justify-end mb-6">
            <HamburgerMenu />
          </div>
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Loading your knots...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-xl">
        <div className="flex justify-end mb-6">
          <HamburgerMenu />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-foreground">My Knots</h1>
        <p className="mb-8 text-muted-foreground">
          What you meant to come back to.
        </p>

        {knots.length > 0 ? (
          <SortableKnotList
            knots={knots}
            onReorder={handleReorder}
            onToggle={handleToggle}
            onDelete={handleDelete}
          />
        ) : (
          <p className="py-8 text-center text-muted-foreground">
            No knots to track. Add some to get started!
          </p>
        )}
      </div>

      {/* FAB and modal form */}
      <KnotForm onSubmit={handleAddKnot} />
    </main>
  )
}
