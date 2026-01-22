"use client"

import { useState, useEffect } from "react"
import KnotCard from "@/components/knot-card" // Import KnotCard component
import { SortableKnotList } from "@/components/sortable-knot-list"
import { KnotForm } from "@/components/knot-form"
import { supabase } from "@/lib/supabase"

interface Knot {
  id: string
  title: string
  description: string
  status: "active" | "completed"
}

export default function Page() {
  const [knots, setKnots] = useState<Knot[]>([])
  const [loading, setLoading] = useState(true)

  // Load knots from Supabase on mount
  useEffect(() => {
    loadKnots()
  }, [])

  // Subscribe to real-time changes
  useEffect(() => {
    const channel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newTask = payload.new as any
            const newKnot: Knot = {
              id: newTask.id,
              title: newTask.title,
              description: newTask.description || '',
              status: newTask.status,
            }

            // Add new knot if it doesn't already exist (avoid duplicates from optimistic updates)
            setKnots((prev) => {
              if (prev.some((k) => k.id === newKnot.id)) return prev
              return [newKnot, ...prev]
            })
          } else if (payload.eventType === 'UPDATE') {
            const updatedTask = payload.new as any
            setKnots((prev) =>
              prev.map((k) =>
                k.id === updatedTask.id
                  ? {
                      ...k,
                      title: updatedTask.title,
                      description: updatedTask.description || '',
                      status: updatedTask.status,
                    }
                  : k
              )
            )
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
  }, [])

  const loadKnots = async () => {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      const formattedKnots: Knot[] = (data || []).map((task: any) => ({
        id: task.id,
        title: task.title,
        description: task.description || '',
        status: task.status as 'active' | 'completed',
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

    // Optimistic update
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
      // Revert on error
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

  const handleReorder = (reorderedKnots: Knot[]) => {
    setKnots(reorderedKnots)
    // TODO: Persist order to database if needed
  }

  const handleAddKnot = async (data: { title: string; description: string }) => {
    try {
      const { data: newTask, error } = await supabase
        .from('tasks')
        .insert({
          title: data.title,
          description: data.description,
          status: 'active',
        })
        .select()
        .single()

      if (error) throw error

      const newKnot: Knot = {
        id: newTask.id,
        title: newTask.title,
        description: newTask.description || '',
        status: newTask.status,
      }

      setKnots((prev) => [newKnot, ...prev])
    } catch (error) {
      console.error('Error adding knot:', error)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background px-4 py-12">
        <div className="mx-auto max-w-xl">
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
        <h1 className="mb-2 text-2xl font-bold text-foreground">My Knots</h1>
        <p className="mb-8 text-muted-foreground">
          What you meant to come back to.
        </p>

        <div className="mb-12">
          <KnotForm onSubmit={handleAddKnot} />
        </div>

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
    </main>
  )
}
