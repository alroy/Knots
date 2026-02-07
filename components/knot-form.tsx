"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useSafariPWAFix } from "@/hooks/use-safari-pwa-fix"
import { TaskMetadata, isSlackMetadata } from "@/lib/types"
import { prepareDescriptionForEdit, detectSlackTask } from "@/lib/slack/text-utils"
import { SlackProvenanceRow } from "@/components/ui/slack-badge"
import type { ContentColumnRef } from "@/app/page"

function KnotIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="currentColor"
      className={className}
    >
      <path d="m20.969 32.527c0-16.008 13.023-29.031 29.031-29.031s29.031 13.023 29.031 29.031c0 3.0938-0.89844 7.9766-2.8711 11.395l-20.238 35.055-3.6992-6.4102 18.387-31.848c1.3086-2.2656 2.0117-5.9102 2.0117-8.1875 0-12.473-10.148-22.621-22.621-22.621-12.473-0.003906-22.621 10.145-22.621 22.617 0 0.82422 0.089844 1.7734 0.25 2.7383h-1.0117c-1.7461 0-3.582 0.26172-5.3633 0.68359-0.1875-1.2031-0.28516-2.3828-0.28516-3.4219zm23.375 60.086c-4.4102 2.5469-9.4258 3.8945-14.492 3.8945-10.352 0-19.996-5.5664-25.168-14.52-3.8789-6.7188-4.9062-14.543-2.9023-22.035 2.0078-7.4922 6.8125-13.754 13.527-17.629 2.6797-1.5469 7.3555-3.2109 11.305-3.2109h40.48l-3.7031 6.4102-31.223 0.003906h-5.5547c-2.6133 0-6.125 1.2109-8.0977 2.3516-5.2344 3.0195-8.9766 7.8984-10.539 13.734-1.5625 5.8359-0.76172 11.934 2.2617 17.168 4.0273 6.9766 11.543 11.312 19.613 11.312 3.9453 0 7.8477-1.0508 11.285-3.0352 0.71484-0.41016 1.4883-0.96094 2.25-1.5859l0.50391 0.87891c0.87109 1.5117 2.0156 2.9727 3.2734 4.3047-0.94922 0.75781-1.9141 1.4336-2.8203 1.957zm50.973-10.629c-5.1719 8.957-14.812 14.523-25.168 14.523-5.0703 0-10.082-1.3477-14.492-3.8945-2.6797-1.5469-6.4609-4.7656-8.4336-8.1836l-20.238-35.055h7.4023l15.613 27.039 2.7773 4.8086c0.46875 0.80859 1.1367 1.668 1.9844 2.5508 1.2461 1.2969 2.7812 2.5234 4.1016 3.2891 3.4375 1.9844 7.3398 3.0352 11.285 3.0352 8.0664 0 15.586-4.3359 19.613-11.316 3.0234-5.2305 3.8242-11.328 2.2617-17.164-1.5625-5.8359-5.3086-10.715-10.539-13.738-0.71484-0.41016-1.5781-0.80859-2.4961-1.1562l0.50391-0.875c0.87109-1.5117 1.5664-3.2344 2.0938-4.9883 1.1367 0.44531 2.207 0.94922 3.1055 1.4688 6.7148 3.8789 11.52 10.137 13.527 17.629 2.0039 7.4883 0.97656 15.312-2.9023 22.027z" />
    </svg>
  )
}

// Type for edit mode task data
export interface EditTask {
  id: string
  title: string
  description: string
  metadata?: TaskMetadata
  sourceType?: string
  sourceUrl?: string
}

interface KnotFormProps {
  onSubmit: (data: { title: string; description: string }) => void
  onUpdate?: (id: string, data: { title: string; description: string }) => Promise<boolean>
  editTask?: EditTask | null
  onEditClose?: () => void
  /** Reference to content column for desktop FAB positioning */
  contentColumnRef?: ContentColumnRef
}

export function KnotForm({ onSubmit, onUpdate, editTask, onEditClose, contentColumnRef }: KnotFormProps) {
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [error, setError] = React.useState("")
  const [touched, setTouched] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isHovering, setIsHovering] = React.useState(false)
  const titleInputRef = React.useRef<HTMLInputElement>(null)
  const fabRef = React.useRef<HTMLDivElement>(null)

  // Track FAB position relative to content column on desktop
  const [fabPosition, setFabPosition] = React.useState<{ right: number } | null>(null)

  // Calculate FAB position relative to content column on desktop
  React.useEffect(() => {
    const updateFabPosition = () => {
      if (!contentColumnRef?.current) {
        setFabPosition(null)
        return
      }

      const isDesktop = window.matchMedia('(min-width: 768px)').matches
      if (!isDesktop) {
        setFabPosition(null)
        return
      }

      const columnRect = contentColumnRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      // Position FAB 20px from the right edge of the content column
      const rightOffset = viewportWidth - columnRect.right + 20
      setFabPosition({ right: rightOffset })
    }

    updateFabPosition()
    window.addEventListener('resize', updateFabPosition)
    return () => window.removeEventListener('resize', updateFabPosition)
  }, [contentColumnRef])

  // Determine if we're in edit mode based on editTask prop
  const isEditMode = !!editTask
  const isOpen = isEditMode || isCreateOpen

  // Determine Slack context for edit mode - from metadata (new) or legacy detection (old)
  const slackContext = React.useMemo(() => {
    if (!editTask) return null

    // Priority 1: Direct source fields from EditTask (from DB columns)
    if (editTask.sourceType === 'slack' && editTask.sourceUrl) {
      const authorName = isSlackMetadata(editTask.metadata)
        ? editTask.metadata.source.author?.display_name
        : undefined
      return {
        isSlack: true,
        permalink: editTask.sourceUrl,
        authorName,
      }
    }

    // Priority 2: Check metadata (for tasks with metadata but no source columns)
    if (isSlackMetadata(editTask.metadata)) {
      return {
        isSlack: true,
        permalink: editTask.metadata.source.permalink,
        authorName: editTask.metadata.source.author?.display_name,
      }
    }

    // Priority 3: Fall back to legacy detection for old tasks
    const detected = detectSlackTask(editTask.description)
    if (detected.isSlack) {
      return {
        isSlack: true,
        permalink: detected.permalink,
        authorName: detected.senderName,
      }
    }

    return null
  }, [editTask])

  // When editTask changes, populate form fields
  // Strip legacy Slack source block from description for cleaner editing
  React.useEffect(() => {
    if (editTask) {
      setTitle(editTask.title)
      // Clean up description by removing legacy "---\nSource: Slack..." block
      setDescription(prepareDescriptionForEdit(editTask.description))
      setError("")
      setTouched(false)
    }
  }, [editTask])

  // Close modal when app resumes from Safari PWA background
  // to prevent stale modal/overlay state
  const handleResume = React.useCallback(() => {
    setIsCreateOpen(false)
    if (onEditClose) onEditClose()
  }, [onEditClose])

  useSafariPWAFix({ onResume: handleResume })

  // iOS-safe autofocus with timeout (50-150ms delay for reliability)
  React.useEffect(() => {
    if (isOpen) {
      const timeoutId = setTimeout(() => {
        titleInputRef.current?.focus()
      }, 100)
      return () => clearTimeout(timeoutId)
    }
  }, [isOpen])

  const handleClose = () => {
    if (isEditMode) {
      onEditClose?.()
    } else {
      setIsCreateOpen(false)
    }
    // Reset form state after closing
    setTitle("")
    setDescription("")
    setError("")
    setTouched(false)
    setIsSubmitting(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)

    const trimmedTitle = title.trim()

    if (!trimmedTitle) {
      setError("Please add a title")
      return
    }

    if (isEditMode && onUpdate && editTask) {
      // Edit mode: call update function
      setIsSubmitting(true)
      try {
        const success = await onUpdate(editTask.id, {
          title: trimmedTitle,
          description: description.trim(),
        })
        if (success) {
          handleClose()
        }
        // If not successful, keep modal open - error state is handled by onUpdate
      } catch {
        // Keep modal open on error, preserve user input
        setError("Failed to save. Please try again.")
      } finally {
        setIsSubmitting(false)
      }
    } else {
      // Create mode: call original onSubmit
      onSubmit({ title: trimmedTitle, description: description.trim() })
      handleClose()
    }
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value)
    if (error) {
      setError("")
    }
  }

  // Inline styles for hardware acceleration on iOS Safari PWA
  const fixedStyle: React.CSSProperties = {
    transform: "translateZ(0)",
    WebkitBackfaceVisibility: "hidden",
    backfaceVisibility: "hidden",
  }

  return (
    <>
      {/* FAB Button - Fixed at bottom right (only show when not in edit mode) */}
      {/* On desktop: positioned relative to content column, smaller size, hover label */}
      {!isEditMode && (
        <div
          ref={fabRef}
          className="fixed bottom-6 z-30 flex items-center gap-3"
          style={{
            ...fixedStyle,
            right: fabPosition?.right ?? 24,
            transition: 'right 150ms ease-out',
          }}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
        >
          {/* Hover label - desktop only */}
          <span
            className={`
              hidden md:block text-sm font-medium text-muted-foreground
              transition-all duration-200 ease-out whitespace-nowrap
              ${isHovering ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'}
            `}
            aria-hidden="true"
          >
            New knot
          </span>
          <Button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            size="icon"
            className="h-14 w-14 md:h-12 md:w-12 rounded-full shadow-lg"
            style={{ touchAction: "manipulation" }}
            aria-label="Tie a new knot"
          >
            <KnotIcon className="h-6 w-6 md:h-5 md:w-5" />
          </Button>
        </div>
      )}

      {/* Modal Backdrop - scrollable container for iOS keyboard */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 overflow-y-auto ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        style={{
          ...fixedStyle,
          // iOS viewport safety - use dvh with svh fallback
          maxHeight: "100dvh",
        }}
        onClick={handleClose}
        aria-hidden="true"
      >
        {/* Spacer for centering on scroll */}
        <div className="min-h-full flex items-center justify-center p-4">
          {/* Empty div to prevent backdrop click from closing when clicking inside modal */}
        </div>
      </div>

      {/* Modal Form - positioned for iOS keyboard scroll */}
      <div
        className={`fixed inset-x-4 z-50 mx-auto max-w-md transition-all duration-300 ${
          isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
        }`}
        style={{
          ...fixedStyle,
          // Position for iOS keyboard - use top positioning with transform
          // This allows the modal to be scrolled into view when keyboard opens
          top: "50%",
          transform: isOpen ? "translateY(-50%) translateZ(0)" : "translateY(-50%) scale(0.95) translateZ(0)",
          // Ensure modal doesn't exceed viewport
          maxHeight: "calc(100dvh - 2rem)",
          overflowY: "auto",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={isEditMode ? "Edit knot" : "Add new knot"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-background rounded-lg shadow-xl p-6">
          <form onSubmit={handleSubmit}>
            <div className="space-y-2 mb-5">
              <Label htmlFor="title" className="text-sm text-muted-foreground">
                Title
              </Label>
              <Input
                ref={titleInputRef}
                id="title"
                type="text"
                placeholder="What needs to be untangled?"
                value={title}
                onChange={handleTitleChange}
                aria-invalid={touched && !!error}
                aria-describedby={touched && error ? "title-error" : undefined}
                className="h-10 bg-card border-border/60 shadow-none"
                style={{ touchAction: "manipulation" }}
              />
              {touched && error && (
                <p id="title-error" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>

            <div className="space-y-2 mb-6">
              <Label htmlFor="description" className="text-sm text-muted-foreground">
                Description <span className="text-muted-foreground/60">(optional)</span>
              </Label>
              <Textarea
                id="description"
                placeholder="Add details..."
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-card border-border/60 shadow-none resize-none"
                style={{ touchAction: "manipulation" }}
              />
            </div>

            {/* Read-only Slack provenance row for Slack-origin tasks */}
            {isEditMode && slackContext?.isSlack && (
              <div className="mb-6 pt-4 border-t border-border/40">
                <SlackProvenanceRow
                  authorName={slackContext.authorName}
                  permalink={slackContext.permalink}
                />
              </div>
            )}

            <div className="flex items-center gap-4">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto px-5 h-9 font-medium active:scale-[0.98] transition-transform duration-75"
                style={{ touchAction: "manipulation" }}
              >
                {isSubmitting ? "Saving..." : isEditMode ? "Save changes" : "Tie Knot"}
              </Button>
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="text-muted-foreground hover:text-foreground text-sm transition-colors duration-100"
                style={{ touchAction: "manipulation" }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
