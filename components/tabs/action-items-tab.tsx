"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useAuth } from "@/contexts/auth-context"
import { cn, formatRelativeTime } from "@/lib/utils"
import { Check, X, ExternalLink, MessageSquare, Video, RefreshCw } from "lucide-react"

interface ActionItem {
  id: string
  actionItem: string
  source: 'slack' | 'granola'
  sourceChannel: string | null
  messageFrom: string | null
  messageLink: string | null
  messageTimestamp: string | null
  status: 'new' | 'done' | 'dismissed'
  rawContext: string | null
  scanTimestamp: string | null
  createdAt: string
}

interface ActionItemsTabProps {
  contentColumnRef: React.RefObject<HTMLDivElement | null>
}

export function ActionItemsTab({ contentColumnRef }: ActionItemsTabProps) {
  const { user } = useAuth()
  const [items, setItems] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [filterSource, setFilterSource] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (user) loadItems()
  }, [user])

  // Real-time subscription
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('action-items-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'action_items', filter: `user_id=eq.${user.id}` }, () => {
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
        .eq('user_id', user.id)
        .order('message_timestamp', { ascending: false, nullsFirst: false })

      if (error) throw error

      setItems((data || []).map((row: any) => ({
        id: row.id,
        actionItem: row.action_item,
        source: row.source,
        sourceChannel: row.source_channel,
        messageFrom: row.message_from,
        messageLink: row.message_link,
        messageTimestamp: row.message_timestamp,
        status: row.status,
        rawContext: row.raw_context,
        scanTimestamp: row.scan_timestamp,
        createdAt: row.created_at,
      })))
    } catch (error) {
      console.error('Error loading action items:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (id: string, newStatus: 'done' | 'dismissed') => {
    const item = items.find(i => i.id === id)
    if (!item) return

    // Optimistic update
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i))

    try {
      const { error } = await supabase
        .from('action_items')
        .update({ status: newStatus })
        .eq('id', id)
      if (error) throw error
    } catch (error) {
      console.error('Error updating action item status:', error)
      // Rollback
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: item.status } : i))
    }
  }

  const handleReopen = async (id: string) => {
    const item = items.find(i => i.id === id)
    if (!item) return

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

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/sync/action-items', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        console.error('Sync failed:', body)
      } else {
        await loadItems()
      }
    } catch (error) {
      console.error('Sync error:', error)
    } finally {
      setSyncing(false)
    }
  }

  const filteredItems = filterSource
    ? items.filter(i => i.source === filterSource)
    : items

  const newItems = filteredItems.filter(i => i.status === 'new')
  const doneItems = filteredItems.filter(i => i.status === 'done' || i.status === 'dismissed')

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="mb-2 text-2xl font-bold text-foreground">Action Items</h1>
            <p className="text-muted-foreground">Tasks extracted from Slack and meetings.</p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className={cn(
              "shrink-0 p-2 rounded-md text-muted-foreground hover:text-primary transition-colors",
              syncing && "animate-spin"
            )}
            aria-label="Sync from Monday.com"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Source filter chips */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilterSource(null)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
            !filterSource ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"
          )}
        >
          All
        </button>
        <button
          onClick={() => setFilterSource(filterSource === 'slack' ? null : 'slack')}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors inline-flex items-center gap-1",
            filterSource === 'slack' ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"
          )}
        >
          <MessageSquare className="h-3 w-3" />
          Slack
        </button>
        <button
          onClick={() => setFilterSource(filterSource === 'granola' ? null : 'granola')}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors inline-flex items-center gap-1",
            filterSource === 'granola' ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground"
          )}
        >
          <Video className="h-3 w-3" />
          Meetings
        </button>
      </div>

      {newItems.length > 0 ? (
        <div className="flex flex-col gap-3">
          {newItems.map((item) => (
            <ActionItemCard
              key={item.id}
              item={item}
              isExpanded={expandedId === item.id}
              onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onDone={() => handleStatusChange(item.id, 'done')}
              onDismiss={() => handleStatusChange(item.id, 'dismissed')}
            />
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-muted-foreground">
          {filterSource ? `No open ${filterSource === 'slack' ? 'Slack' : 'meeting'} action items.` : 'No open action items.'}
        </p>
      )}

      {doneItems.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
            Completed ({doneItems.length})
          </h2>
          <div className="flex flex-col gap-2">
            {doneItems.map((item) => (
              <ActionItemCard
                key={item.id}
                item={item}
                isExpanded={expandedId === item.id}
                onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                onReopen={() => handleReopen(item.id)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// --- Action Item Card ---

function ActionItemCard({ item, isExpanded, onToggleExpand, onDone, onDismiss, onReopen }: {
  item: ActionItem
  isExpanded: boolean
  onToggleExpand: () => void
  onDone?: () => void
  onDismiss?: () => void
  onReopen?: () => void
}) {
  const isDone = item.status === 'done' || item.status === 'dismissed'
  const SourceIcon = item.source === 'slack' ? MessageSquare : Video

  return (
    <div
      className={cn(
        "group rounded-lg bg-card p-4 transition-[background-color,opacity] duration-200 animate-in fade-in duration-300",
        !isDone && "hover:bg-accent-hover",
        isDone && "bg-accent-subtle opacity-75",
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
        <div className="min-w-0 flex-1 cursor-pointer" onClick={onToggleExpand}>
          <p className={cn(
            "text-base font-semibold text-foreground",
            isDone && "text-muted-foreground line-through decoration-muted-foreground/50"
          )}>
            {item.actionItem}
          </p>

          {/* Byline: source + channel + from + timestamp */}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <SourceIcon className="h-3 w-3 text-muted-foreground shrink-0" />
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

          {/* Expanded: raw context */}
          {isExpanded && item.rawContext && (
            <div className="mt-3 p-3 rounded-md bg-accent text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {item.rawContext}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-0.5">
          {item.messageLink && (
            <a
              href={item.messageLink}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 p-1.5 rounded-md text-muted-foreground/50 hover:text-primary transition-colors"
              aria-label="Open source"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          {!isDone && onDismiss && (
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss() }}
              className="shrink-0 p-1.5 rounded-md text-muted-foreground/50 hover:text-destructive transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
