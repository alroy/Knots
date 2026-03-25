import { cn } from "@/lib/utils"

/**
 * Standardized flex container for top-right action icons on list cards.
 * Provides consistent gap, alignment with the first line of card title,
 * and relative positioning for dropdowns (e.g. snooze menu).
 */
export function CardActionGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex shrink-0 items-center gap-1 relative mt-[3px]", className)}>
      {children}
    </div>
  )
}

/** Standard styling for an action icon button inside CardActionGroup. */
export const cardActionButtonClass =
  "shrink-0 flex items-center justify-center w-11 h-11 rounded-md transition-[color,opacity] opacity-50 sm:opacity-0 sm:group-hover:opacity-50 sm:group-hover:hover:opacity-100 hover:opacity-100"

/** Muted icon style (non-destructive actions). */
export const cardActionMutedClass = `${cardActionButtonClass} text-slate-400 hover:text-slate-600`

/** Destructive icon style (delete). */
export const cardActionDestructiveClass = `${cardActionButtonClass} text-muted-foreground/50 hover:text-destructive`
