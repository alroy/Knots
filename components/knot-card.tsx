"use client"

import React from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { GripVertical, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface KnotCardProps {
  id: string
  title: string
  description: string
  status: "active" | "completed"
  onToggle: (id: string) => void
  onDelete: (id: string) => void
  isDragging?: boolean
  isOverlay?: boolean
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
}

export default function KnotCard({
  id,
  title,
  description,
  status,
  onToggle,
  onDelete,
  isDragging = false,
  isOverlay = false,
  dragHandleProps,
}: KnotCardProps) {
  const isCompleted = status === "completed"

  return (
    <div
      {...dragHandleProps}
      className={cn(
        "group flex items-start gap-3 rounded-lg bg-card p-4 transition-[background-color,opacity,transform,box-shadow] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
        !isOverlay && "animate-in fade-in duration-300",
        !isCompleted && "hover:bg-accent-hover",
        isCompleted && "bg-accent-subtle opacity-75",
        isDragging && "opacity-40",
        isOverlay && "shadow-md cursor-grabbing",
        !isOverlay && "cursor-grab active:cursor-grabbing touch-none"
      )}
    >
      <div
        className={cn(
          "mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/30 transition-[opacity,color] duration-100 ease-out",
          isOverlay && "text-muted-foreground"
        )}
        aria-hidden="true"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      <Checkbox
        id={`knot-${id}`}
        checked={isCompleted}
        onCheckedChange={() => onToggle(id)}
        className="mt-0.5 shrink-0"
      />

      <div className="min-w-0 flex-1">
        <label
          htmlFor={`knot-${id}`}
          className={cn(
            "block cursor-pointer text-base font-semibold text-foreground transition-[color,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
            isCompleted && "text-muted-foreground line-through decoration-muted-foreground/50"
          )}
        >
          {title}
        </label>
        <p
          className={cn(
            "mt-1 text-sm text-muted-foreground transition-[color,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
            isCompleted && "text-muted-foreground/70"
          )}
        >
          {description}
        </p>
      </div>

      <button
        onClick={() => onDelete(id)}
        aria-label={`Delete ${title}`}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground/50 opacity-100 transition-opacity duration-100 ease-out hover:text-destructive focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
