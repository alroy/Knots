import { cn } from "@/lib/utils"

/**
 * Swipe-to-reveal wrapper for card components.
 *
 * Mobile (pointer: coarse):  CSS Scroll Snap — swipe left to reveal actions.
 * Desktop (hover + pointer: fine): actions overlay on hover via opacity/translate.
 *
 * Structure:
 *   .swipe-track          ← outer scroll container
 *     .swipe-train        ← inner flex rail
 *       .swipe-content    ← Element A (full-width card)
 *       .swipe-actions    ← Element B (action buttons)
 */
export function SwipeTrack({
  children,
  actions,
  className,
}: {
  /** Card content (Element A) */
  children: React.ReactNode
  /** Action buttons (Element B) */
  actions: React.ReactNode
  /** Extra classes on the outer track container */
  className?: string
}) {
  return (
    <div className={cn("swipe-track", className)}>
      <div className="swipe-train">
        <div className="swipe-content">
          {children}
        </div>
        <div className="swipe-actions">
          {actions}
        </div>
      </div>
    </div>
  )
}
