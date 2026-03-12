"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"
import { cn, formatRelativeTime } from "@/lib/utils"
import { Check, X, ExternalLink } from "lucide-react"
import type { ActionItem } from "@/lib/chief-of-staff-types"

interface ActionItemsTabProps {
  contentColumnRef: React.RefObject<HTMLDivElement | null>
}

export function ActionItemsTab({ contentColumnRef }: ActionItemsTabProps) {
  const { user } = useAuth()
  const [items, setItems] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'new' | 'all'>('new')
  const supabase = createClient()

  useEffect(() => {
    if (user) loadItems()
  }, [user])

  // Subscribe to real-time changes on action_items
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('action-items-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'action_items' }, () => {
        loadItems()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  const loadItems = async () => {
    if (!user) return
    try {
      const { data, error } = await supabase
        .from('action_items')
        .select('*')
        .order('message_timestamp', { ascending: false })

      if (error) throw error
      setItems((data || []).map(mapActionItem))
    } catch (error) {
      console.error('Error loading action items:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkDone = async (id: string) => {
    // Optimistic update
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, status: 'done' as const } : item
    ))
    try {
      const { error } = await supabase
        .from('action_items')
        .update({ status: 'done' })
        .eq('id', id)
      if (error) throw error
    } catch (error) {
      console.error('Error marking action item done:', error)
      loadItems()
    }
  }

  const handleDismiss = async (id: string) => {
    // Optimistic update
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, status: 'dismissed' as const } : item
    ))
    try {
      const { error } = await supabase
        .from('action_items')
        .update({ status: 'dismissed' })
        .eq('id', id)
      if (error) throw error
    } catch (error) {
      console.error('Error dismissing action item:', error)
      loadItems()
    }
  }

  const handleUndone = async (id: string) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, status: 'new' as const } : item
    ))
    try {
      const { error } = await supabase
        .from('action_items')
        .update({ status: 'new' })
        .eq('id', id)
      if (error) throw error
    } catch (error) {
      console.error('Error reopening action item:', error)
      loadItems()
    }
  }

  const newItems = items.filter(i => i.status === 'new')
  const doneItems = items.filter(i => i.status === 'done' || i.status === 'dismissed')
  const displayItems = filter === 'new' ? newItems : items

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading action items...</p>
      </div>
    )
  }

  return (
    <>
      <header className="mb-6 md:mb-8">
        <h1 className="mb-2 text-2xl font-bold text-foreground">Action Items</h1>
        <p className="text-muted-foreground">Extracted from your Slack mentions and meetings.</p>
      </header>

      {/* Filter chips */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilter('new')}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
            filter === 'new' ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"
          )}
        >
          New ({newItems.length})
        </button>
        <button
          onClick={() => setFilter('all')}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
            filter === 'all' ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"
          )}
        >
          All ({items.length})
        </button>
      </div>

      {filter === 'new' ? (
        <>
          {newItems.length > 0 ? (
            <div className="flex flex-col gap-3">
              {newItems.map(item => (
                <ActionItemCard
                  key={item.id}
                  item={item}
                  onMarkDone={() => handleMarkDone(item.id)}
                  onDismiss={() => handleDismiss(item.id)}
                />
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-muted-foreground">
              No new action items. You're all caught up!
            </p>
          )}

          {doneItems.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
                Completed & Dismissed ({doneItems.length})
              </h2>
              <div className="flex flex-col gap-2">
                {doneItems.map(item => (
                  <ActionItemCard
                    key={item.id}
                    item={item}
                    onUndone={() => handleUndone(item.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {displayItems.length > 0 ? (
            displayItems.map(item => (
              <ActionItemCard
                key={item.id}
                item={item}
                onMarkDone={item.status === 'new' ? () => handleMarkDone(item.id) : undefined}
                onDismiss={item.status === 'new' ? () => handleDismiss(item.id) : undefined}
                onUndone={item.status !== 'new' ? () => handleUndone(item.id) : undefined}
              />
            ))
          ) : (
            <p className="py-8 text-center text-muted-foreground">
              No action items yet.
            </p>
          )}
        </div>
      )}
    </>
  )
}

// --- Action Item Card ---

function ActionItemCard({ item, onMarkDone, onDismiss, onUndone }: {
  item: ActionItem
  onMarkDone?: () => void
  onDismiss?: () => void
  onUndone?: () => void
}) {
  const isDone = item.status === 'done'
  const isDismissed = item.status === 'dismissed'
  const isResolved = isDone || isDismissed

  const SourceIcon = item.source === 'slack' ? SlackIcon : GranolaIcon

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-lg bg-card p-4 transition-[background-color,opacity] duration-200 animate-in fade-in duration-300",
        !isResolved && "hover:bg-accent-hover",
        isResolved && "bg-accent-subtle opacity-75",
      )}
    >
      {/* Done/Undone button */}
      <button
        onClick={isResolved ? onUndone : onMarkDone}
        className={cn(
          "mt-0.5 shrink-0 rounded-full w-5 h-5 border-2 flex items-center justify-center transition-colors",
          isDone
            ? "border-primary bg-primary text-primary-foreground"
            : isDismissed
            ? "border-muted-foreground/30 bg-muted-foreground/10"
            : "border-muted-foreground/30 hover:border-primary"
        )}
        aria-label={isResolved ? "Reopen" : "Mark done"}
      >
        {isDone && <Check className="h-3 w-3" />}
        {isDismissed && <X className="h-3 w-3 text-muted-foreground/50" />}
      </button>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <span className={cn(
          "block text-base font-semibold text-foreground",
          isResolved && "text-muted-foreground line-through decoration-muted-foreground/50"
        )}>
          {item.actionItem}
        </span>

        {/* Byline: source + channel + sender + timestamp */}
        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
          <SourceIcon className="h-3 w-3 shrink-0" />
          {item.messageFrom && (
            <span>{item.messageFrom}</span>
          )}
          {item.sourceChannel && (
            <>
              {item.messageFrom && <span className="text-muted-foreground/40">·</span>}
              <span>{item.sourceChannel}</span>
            </>
          )}
          {item.messageTimestamp && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span>{formatRelativeTime(item.messageTimestamp)}</span>
            </>
          )}
          {item.messageLink && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <a
                href={item.messageLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-primary/70 hover:text-primary transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                View <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {!isResolved && (
        <div className="flex shrink-0 items-center gap-0.5">
          {onDismiss && (
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss() }}
              className="shrink-0 p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              aria-label={`Dismiss "${item.actionItem}"`}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// --- Source Icons ---

function SlackIcon({ className }: { className?: string }) {
  return <img src="/slack-svgrepo-com.svg" alt="" className={className} aria-hidden="true" />
}

function GranolaIcon({ className }: { className?: string }) {
  return <img src="/granola-icon.svg" alt="" className={className} aria-hidden="true" />
}

// --- Mapping Helper ---

function mapActionItem(row: any): ActionItem {
  return {
    id: row.id,
    createdAt: row.created_at,
    scanTimestamp: row.scan_timestamp,
    source: row.source,
    sourceChannel: row.source_channel || undefined,
    messageFrom: row.message_from || undefined,
    messageLink: row.message_link || undefined,
    messageTimestamp: row.message_timestamp || undefined,
    actionItem: row.action_item,
    status: row.status,
    rawContext: row.raw_context || undefined,
  }
}
