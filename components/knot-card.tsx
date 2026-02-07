"use client"

import React, { useMemo } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { SlackProvenanceRow } from "@/components/ui/slack-badge"
import { GripVertical, Trash2 } from "lucide-react"
import { cn, formatRelativeTime } from "@/lib/utils"
import { TaskMetadata, SlackTaskMetadata, isSlackMetadata } from "@/lib/types"
import {
  prepareTaskForListView,
  detectSlackTask,
} from "@/lib/slack/text-utils"

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
  isDragging?: boolean
  isOverlay?: boolean
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
  /** Whether dragging is active in the list (used to suppress edit clicks) */
  isListDragging?: boolean
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
  isDragging = false,
  isOverlay = false,
  dragHandleProps,
  isListDragging = false,
}: KnotCardProps) {
  const isCompleted = status === "completed"

  // Prepare display text - normalize Slack tokens and truncate for list view
  // Pass user_map from metadata if available for resolving @mentions to real names
  const displayText = useMemo(() => {
    const userMap = isSlackMetadata(metadata) ? (metadata as SlackTaskMetadata).user_map : undefined
    return prepareTaskForListView(title, description, userMap)
  }, [title, description, metadata])

  // Format timestamp for display
  const formattedTime = useMemo(() => formatRelativeTime(createdAt), [createdAt])

  // Determine Slack context - prioritize direct DB columns, then metadata, then legacy detection
  const slackContext = useMemo(() => {
    // Priority 1: Direct source fields from database columns
    // This is the primary source for Slack tasks created via the ingestion pipeline
    if (sourceType === 'slack' && sourceUrl) {
      // Get author name from metadata if available
      const authorName = isSlackMetadata(metadata)
        ? metadata.source.author?.display_name
        : undefined
      const subtype = isSlackMetadata(metadata)
        ? metadata.source.subtype
        : undefined

      return {
        isSlack: true,
        subtype,
        permalink: sourceUrl,
        authorName,
      }
    }

    // Priority 2: Check metadata (for tasks with metadata but no source columns)
    if (isSlackMetadata(metadata)) {
      return {
        isSlack: true,
        subtype: metadata.source.subtype,
        permalink: metadata.source.permalink,
        authorName: metadata.source.author?.display_name,
      }
    }

    // Priority 3: Fall back to legacy detection for old tasks
    const detected = detectSlackTask(description)
    if (detected.isSlack) {
      return {
        isSlack: true,
        subtype: detected.subtype,
        permalink: detected.permalink,
        authorName: detected.senderName,
      }
    }

    return { isSlack: false }
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
    <div
      className={cn(
        "group flex items-start gap-3 rounded-lg bg-card p-4 transition-[background-color,opacity,transform,box-shadow] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
        !isOverlay && "animate-in fade-in duration-300",
        !isCompleted && "hover:bg-accent-hover",
        isCompleted && "bg-accent-subtle opacity-75",
        isDragging && "opacity-40",
        isOverlay && "shadow-md cursor-grabbing",
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
        {/* Slack context badge for Slack-origin tasks */}
        {slackContext.isSlack && (
          <SlackProvenanceRow
            authorName={slackContext.authorName}
            permalink={slackContext.permalink}
            className="mt-2"
          />
        )}
      </div>

      {/* Delete button - clicks should not trigger edit */}
      <button
        onClick={handleDeleteClick}
        aria-label={`Delete ${displayText.title}`}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground/50 opacity-100 transition-opacity duration-100 ease-out hover:text-destructive focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100"
        style={{ touchAction: "manipulation" }}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
