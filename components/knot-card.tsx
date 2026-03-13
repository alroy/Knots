"use client"

import React, { useMemo, useState, useCallback, useRef, useEffect } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { ProvenanceRow } from "@/components/ui/slack-badge"
import { GripVertical, Trash2, Clock } from "lucide-react"
import { cn, formatRelativeTime } from "@/lib/utils"
import { TaskMetadata, SlackTaskMetadata, isSlackMetadata, isGranolaMetadata } from "@/lib/types"
import {
  prepareTaskForListView,
  detectSlackTask,
} from "@/lib/slack/text-utils"
import { SwipeTrack } from "@/components/ui/swipe-track"

export interface KnotCardProps {
  id: string
  title: string
  description: string
  status: "active" | "completed"
  metadata?: TaskMetadata
  createdAt?: string
  // Source provenance fields (from database columns)
  sourceType?: string
  sourceUrl?: string
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  onEdit?: (id: string) => void
  onSnooze?: (id: string, until: Date) => void
  isDragging?: boolean
  isOverlay?: boolean
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
  /** Whether dragging is active in the list (used to suppress edit clicks) */
  isListDragging?: boolean
  /** Notify parent when snooze menu opens/closes (for z-index stacking) */
  onSnoozeMenuOpenChange?: (open: boolean) => void
  /** Whether the card is playing its snooze exit animation */
  isSnoozing?: boolean
  /** Whether the card is playing its entrance animation */
  isEntering?: boolean
}

export default function KnotCard({
  id,
  title,
  description,
  status,
  metadata,
  createdAt,
  sourceType,
  sourceUrl,
  onToggle,
  onDelete,
  onEdit,
  onSnooze,
  isDragging = false,
  isOverlay = false,
  dragHandleProps,
  isListDragging = false,
  onSnoozeMenuOpenChange,
  isSnoozing = false,
  isEntering = false,
}: KnotCardProps) {
  const isCompleted = status === "completed"
  const [snoozeMenuOpen, setSnoozeMenuOpen] = useState(false)
  const handleSnoozeMenuOpenChange = useCallback((open: boolean) => {
    setSnoozeMenuOpen(open)
    onSnoozeMenuOpenChange?.(open)
  }, [onSnoozeMenuOpenChange])

  // Prepare display text - normalize Slack tokens and truncate for list view
  // Pass user_map from metadata if available for resolving @mentions to real names
  const displayText = useMemo(() => {
    const userMap = isSlackMetadata(metadata) ? (metadata as SlackTaskMetadata).user_map : undefined
    return prepareTaskForListView(title, description, userMap)
  }, [title, description, metadata])

  // Format timestamp for display
  const formattedTime = useMemo(() => formatRelativeTime(createdAt), [createdAt])

  // Determine provenance context - Granola, Slack DB columns, metadata, or legacy detection
  const provenance = useMemo(() => {
    // Priority 0: Granola provenance (from n8n automation)
    if (sourceType === 'granola' && sourceUrl) {
      const authorName = isGranolaMetadata(metadata)
        ? metadata.source.author?.display_name
        : undefined
      return {
        hasProvenance: true,
        sourceType: 'granola' as const,
        permalink: sourceUrl,
        authorName,
      }
    }

    // Priority 1: Direct Slack source fields from database columns
    if (sourceType === 'slack' && sourceUrl) {
      const authorName = isSlackMetadata(metadata)
        ? metadata.source.author?.display_name
        : undefined
      return {
        hasProvenance: true,
        sourceType: 'slack' as const,
        permalink: sourceUrl,
        authorName,
      }
    }

    // Priority 2: Check metadata (for tasks with metadata but no source columns)
    if (isGranolaMetadata(metadata)) {
      return {
        hasProvenance: true,
        sourceType: 'granola' as const,
        permalink: metadata.source.granola_url,
        authorName: metadata.source.author?.display_name,
      }
    }

    if (isSlackMetadata(metadata)) {
      return {
        hasProvenance: true,
        sourceType: 'slack' as const,
        permalink: metadata.source.permalink,
        authorName: metadata.source.author?.display_name,
      }
    }

    // Priority 3: Fall back to legacy detection for old Slack tasks
    const detected = detectSlackTask(description)
    if (detected.isSlack) {
      return {
        hasProvenance: true,
        sourceType: 'slack' as const,
        permalink: detected.permalink,
        authorName: detected.senderName,
      }
    }

    return { hasProvenance: false }
  }, [sourceType, sourceUrl, metadata, description])

  // Handle click on card content area to open edit modal
  const handleContentClick = () => {
    // Prevent edit if currently dragging or recently finished dragging
    if (isListDragging || isDragging || isOverlay) {
      return
    }

    // Don't trigger edit on overlay or if no onEdit handler
    if (!onEdit) return

    onEdit(id)
  }


  // Prevent delete button clicks from bubbling to card
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(id)
  }

  return (
    <SwipeTrack
      actions={
        <SnoozeAndDelete
          id={id}
          title={displayText.title}
          onSnooze={onSnooze}
          onDelete={handleDeleteClick}
          onMenuOpenChange={handleSnoozeMenuOpenChange}
        />
      }
    >
      <div
        className={cn(
          "group relative flex items-start gap-3 rounded-lg bg-card p-4 transition-[background-color,opacity,transform,box-shadow] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
          !isOverlay && !isSnoozing && !isEntering && "animate-in fade-in duration-300",
          !isCompleted && "hover:bg-accent-hover",
          isCompleted && "bg-accent-subtle opacity-75",
          isDragging && "opacity-40",
          isOverlay && "shadow-md cursor-grabbing",
          snoozeMenuOpen && "z-50",
          isSnoozing && "animate-out fade-out slide-out-to-right duration-300 fill-mode-forwards",
          isEntering && "animate-in fade-in slide-in-from-right duration-300",
        )}
      >
        {/* Drag handle - separate from content to not trigger edit */}
        {/* Desktop: hidden until hover/focus, smaller hit area */}
        {/* Mobile: always visible for touch discoverability */}
        <div
          {...dragHandleProps}
          className={cn(
            "mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/30 transition-[opacity,color] duration-100 ease-out",
            isOverlay && "text-muted-foreground",
            !isOverlay && "cursor-grab active:cursor-grabbing touch-none",
            !isOverlay && "drag-handle-desktop md:p-0.5 md:hover:text-muted-foreground"
          )}
          aria-hidden="true"
          style={{ touchAction: "none" }}
        >
          <GripVertical className="h-4 w-4 md:h-3.5 md:w-3.5" />
        </div>

        {/* Checkbox - sibling to content area, clicks won't trigger edit */}
        <div style={{ touchAction: "manipulation" }}>
          <Checkbox
            id={`knot-${id}`}
            checked={isCompleted}
            onCheckedChange={() => onToggle(id)}
            className="mt-0.5 shrink-0"
          />
        </div>

        {/* Content area - tappable for edit */}
        <div
          className="min-w-0 flex-1 cursor-pointer"
          onClick={handleContentClick}
          onPointerUp={(e) => {
            // Use pointerUp as backup for iOS Safari
            // Only trigger if not a drag gesture
            if (e.pointerType === 'touch' && !isListDragging && !isDragging && !isOverlay && onEdit) {
              // Small check - if click also fires, it will be a no-op due to modal state
            }
          }}
          style={{ touchAction: "manipulation" }}
          role="button"
          tabIndex={onEdit ? 0 : undefined}
          onKeyDown={(e) => {
            if (onEdit && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              onEdit(id)
            }
          }}
          aria-label={onEdit ? `Edit ${displayText.title}` : undefined}
        >
          <span
            className={cn(
              "block text-base font-semibold text-foreground transition-[color,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
              isCompleted && "text-muted-foreground line-through decoration-muted-foreground/50"
            )}
          >
            {displayText.title}
          </span>
          <span
            className={cn(
              "block text-xs text-muted-foreground transition-[color,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
              isCompleted && "text-muted-foreground/70"
            )}
          >
            {formattedTime || 'just now'}
          </span>
          {displayText.description && (
            <p
              className={cn(
                "mt-1 text-sm text-muted-foreground transition-[color,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
                isCompleted && "text-muted-foreground/70"
              )}
            >
              {displayText.description}
            </p>
          )}
          {/* Provenance badge for Slack/Granola-origin tasks */}
          {provenance.hasProvenance && (
            <ProvenanceRow
              sourceType={'sourceType' in provenance ? provenance.sourceType : 'slack'}
              authorName={'authorName' in provenance ? provenance.authorName : undefined}
              permalink={'permalink' in provenance ? provenance.permalink : undefined}
              className="mt-2"
            />
          )}
        </div>
      </div>
    </SwipeTrack>
  )
}

const SNOOZE_OPTIONS = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
]

function SnoozeAndDelete({ id, title, onSnooze, onDelete, onMenuOpenChange }: {
  id: string
  title: string
  onSnooze?: (id: string, until: Date) => void
  onDelete: (e: React.MouseEvent) => void
  onMenuOpenChange?: (open: boolean) => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const toggleMenu = useCallback((open: boolean) => {
    setShowMenu(open)
    onMenuOpenChange?.(open)
  }, [onMenuOpenChange])

  // Close menu on any click outside the container
  // (fixed backdrop doesn't work here because ancestor transform breaks position:fixed)
  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        toggleMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu, toggleMenu])

  return (
    <div ref={containerRef} className="flex shrink-0 items-center gap-0.5 relative">
      {onSnooze && (
        <button
          onClick={(e) => { e.stopPropagation(); toggleMenu(!showMenu) }}
          aria-label={`Snooze ${title}`}
          className={cn(
            "shrink-0 rounded-md p-1.5 text-muted-foreground/50 opacity-100 transition-opacity duration-100 ease-out hover:text-primary focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100",
            showMenu && "sm:!opacity-100"
          )}
          style={{ touchAction: "manipulation" }}
        >
          <Clock className="h-4 w-4" />
        </button>
      )}
      <button
        onClick={onDelete}
        aria-label={`Delete ${title}`}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground/50 opacity-100 transition-opacity duration-100 ease-out hover:text-destructive focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100"
        style={{ touchAction: "manipulation" }}
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {showMenu && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-1 min-w-[140px]">
            {SNOOZE_OPTIONS.map(({ label, days }) => (
              <button
                key={days}
                onClick={(e) => {
                  e.stopPropagation()
                  const d = new Date()
                  d.setDate(d.getDate() + days)
                  d.setHours(9, 0, 0, 0)
                  onSnooze!(id, d)
                  toggleMenu(false)
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-foreground hover:bg-accent rounded transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
      )}
    </div>
  )
}
