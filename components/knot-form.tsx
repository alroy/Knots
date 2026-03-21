"use client"

import * as React from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Plus, Undo2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSafariPWAFix } from "@/hooks/use-safari-pwa-fix"
import { TaskMetadata, isSlackMetadata, isGranolaMetadata } from "@/lib/types"
import { prepareDescriptionForEdit, detectSlackTask } from "@/lib/text-utils"
import { ProvenanceRow } from "@/components/ui/provenance-row"
import type { ContentColumnRef } from "@/app/page"

// Type for edit mode task data
export interface EditTask {
  id: string
  title: string
  description: string
  metadata?: TaskMetadata
  sourceType?: string
  sourceUrl?: string
  goalId?: string | null
  /** Item status — determines modal mode (edit vs view-completed) */
  status?: 'active' | 'completed' | 'done' | 'dismissed'
  /** Set when editing an action_item — triggers promotion to tasks table on save */
  _actionItemId?: string
}

export interface GoalOption {
  id: string
  title: string
  priority: number
  status?: string
}

interface KnotFormProps {
  onSubmit: (data: { title: string; description: string; goalId?: string | null }) => void
  onUpdate?: (id: string, data: { title: string; description: string; goalId?: string | null }) => Promise<boolean>
  onRestore?: (id: string) => Promise<boolean>
  editTask?: EditTask | null
  onEditClose?: () => void
  /** Reference to content column for desktop FAB positioning */
  contentColumnRef?: ContentColumnRef
  /** Active goals for the goal selector */
  goals?: GoalOption[]
}

const PRIORITY_LABELS: Record<number, string> = { 1: 'P0', 2: 'P1', 3: 'P2' }

export function KnotForm({ onSubmit, onUpdate, onRestore, editTask, onEditClose, contentColumnRef, goals }: KnotFormProps) {
  const [isCreateOpen, setIsCreateOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [selectedGoalId, setSelectedGoalId] = React.useState<string>("")
  const [error, setError] = React.useState("")
  const [touched, setTouched] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const titleInputRef = React.useRef<HTMLTextAreaElement>(null)
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
  const isCompleted = editTask?.status === 'completed' || editTask?.status === 'done' || editTask?.status === 'dismissed'
  const isOpen = isEditMode || isCreateOpen

  // Determine provenance context for edit mode - Granola, Slack, metadata, or legacy
  const provenance = React.useMemo(() => {
    if (!editTask) return null

    // Priority 0: Granola provenance
    if (editTask.sourceType === 'granola' && editTask.sourceUrl) {
      const authorName = isGranolaMetadata(editTask.metadata)
        ? editTask.metadata.source.author?.display_name
        : undefined
      return {
        hasProvenance: true,
        sourceType: 'granola' as const,
        permalink: editTask.sourceUrl,
        authorName,
      }
    }

    // Priority 1: Direct Slack source fields from EditTask (from DB columns)
    if (editTask.sourceType === 'slack' && editTask.sourceUrl) {
      const authorName = isSlackMetadata(editTask.metadata)
        ? editTask.metadata.source.author?.display_name
        : undefined
      return {
        hasProvenance: true,
        sourceType: 'slack' as const,
        permalink: editTask.sourceUrl,
        authorName,
      }
    }

    // Priority 2: Check metadata (for tasks with metadata but no source columns)
    if (isGranolaMetadata(editTask.metadata)) {
      return {
        hasProvenance: true,
        sourceType: 'granola' as const,
        permalink: editTask.metadata.source.granola_url,
        authorName: editTask.metadata.source.author?.display_name,
      }
    }

    if (isSlackMetadata(editTask.metadata)) {
      return {
        hasProvenance: true,
        sourceType: 'slack' as const,
        permalink: editTask.metadata.source.permalink,
        authorName: editTask.metadata.source.author?.display_name,
      }
    }

    // Priority 3: Fall back to legacy detection for old Slack tasks
    const detected = detectSlackTask(editTask.description)
    if (detected.isSlack) {
      return {
        hasProvenance: true,
        sourceType: 'slack' as const,
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
      setSelectedGoalId(editTask.goalId || "")
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
    setSelectedGoalId("")
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
          goalId: selectedGoalId || null,
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
      onSubmit({ title: trimmedTitle, description: description.trim(), goalId: selectedGoalId || null })
      handleClose()
    }
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
          className="fixed z-30 flex items-center gap-3"
          style={{
            ...fixedStyle,
            bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
            right: fabPosition?.right ?? 24,
            transition: 'right 150ms ease-out',
          }}
        >
<Button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            size="icon"
            className="h-14 w-14 md:h-12 md:w-12 rounded-full shadow-lg"
            style={{ touchAction: "manipulation" }}
            aria-label="Tie a new knot"
          >
            <Plus className="h-6 w-6 md:h-5 md:w-5" />
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
          <div className="mb-4">
            <h2 className="text-lg font-bold text-foreground mb-2">{isEditMode ? (isCompleted ? "Completed Item" : "Edit Item") : "Add to Inbox"}</h2>
            <p className="text-sm text-muted-foreground">{isEditMode ? (isCompleted ? "Review completed item details." : "Review and refine this action item.") : "Park an idea, question, or future task."}</p>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="space-y-2 mb-5">
              <Label htmlFor="title" className="text-sm text-muted-foreground">
                Title
              </Label>
              <Textarea
                ref={titleInputRef}
                id="title"
                placeholder="What needs to be untangled?"
                rows={2}
                value={title}
                onChange={handleTitleChange}
                readOnly={isCompleted}
                aria-invalid={touched && !!error}
                aria-describedby={touched && error ? "title-error" : undefined}
                className={cn("bg-card border-border/60 shadow-none resize-none", isCompleted && "opacity-70 cursor-default")}
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
                readOnly={isCompleted}
                className={cn("bg-card border-border/60 shadow-none resize-none", isCompleted && "opacity-70 cursor-default")}
                style={{ touchAction: "manipulation" }}
              />
            </div>

            {/* Goal selector */}
            {goals && (() => {
              const activeGoals = goals.filter((g) => g.status !== 'completed')
              const completedGoal = goals.find((g) => g.status === 'completed' && g.id === selectedGoalId)
              const hasActiveGoals = activeGoals.length > 0
              const isDisabled = isCompleted || (!hasActiveGoals && !completedGoal)
              return (
              <div className="space-y-2 mb-6">
                <Label htmlFor="goal" className="text-sm text-muted-foreground">
                  Goal <span className="text-muted-foreground/60">(optional)</span>
                </Label>
                <select
                  id="goal"
                  value={selectedGoalId}
                  onChange={(e) => setSelectedGoalId(e.target.value)}
                  disabled={isDisabled || (!hasActiveGoals && !!completedGoal)}
                  className={`flex h-10 w-full rounded-md border border-border/60 bg-card pl-3 pr-8 py-2 text-sm text-foreground appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[position:right_10px_center] bg-no-repeat focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring${isDisabled || (!hasActiveGoals && !!completedGoal) ? ' opacity-50 cursor-not-allowed' : ''}`}
                >
                  <option value="">{!hasActiveGoals && !completedGoal ? "No active goals" : "No goal"}</option>
                  {completedGoal && (
                    <option key={completedGoal.id} value={completedGoal.id} disabled>
                      {PRIORITY_LABELS[completedGoal.priority] || 'P2'} — {completedGoal.title} (completed)
                    </option>
                  )}
                  {activeGoals
                    .sort((a, b) => a.priority - b.priority)
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {PRIORITY_LABELS[g.priority] || 'P2'} — {g.title}
                      </option>
                    ))}
                </select>
              </div>
              )
            })()}

            {/* Read-only provenance row for Slack/Granola-origin tasks */}
            {isEditMode && provenance?.hasProvenance && (
              <div className="mb-6 pt-4 border-t border-border/40">
                <ProvenanceRow
                  sourceType={provenance.sourceType}
                  authorName={provenance.authorName}
                  permalink={provenance.permalink}
                />
              </div>
            )}

            {isEditMode && isCompleted ? (
              <div className="flex flex-row-reverse gap-3 w-full sm:w-auto">
                <Button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 sm:flex-none px-5 h-9 font-medium active:scale-[0.98] transition-transform duration-75"
                  style={{ touchAction: "manipulation" }}
                >
                  Done
                </Button>
                {onRestore && editTask && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={async () => {
                      setIsSubmitting(true)
                      try {
                        const success = await onRestore(editTask.id)
                        if (success) handleClose()
                      } finally {
                        setIsSubmitting(false)
                      }
                    }}
                    className="flex-1 sm:flex-none px-5 h-9 font-medium active:scale-[0.98] transition-transform duration-75 gap-1.5"
                    style={{ touchAction: "manipulation" }}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    {isSubmitting ? "Restoring..." : "Mark as Incomplete"}
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-row-reverse gap-3 w-full sm:w-auto">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 sm:flex-none px-5 h-9 font-medium active:scale-[0.98] transition-transform duration-75"
                  style={{ touchAction: "manipulation" }}
                >
                  {isSubmitting ? "Saving..." : isEditMode ? "Save changes" : "Add to Inbox"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="flex-1 sm:flex-none px-5 h-9 font-medium active:scale-[0.98] transition-transform duration-75"
                  style={{ touchAction: "manipulation" }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </form>
        </div>
      </div>
    </>
  )
}
