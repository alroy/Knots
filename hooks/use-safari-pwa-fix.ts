"use client"

import { useEffect, useCallback, useRef } from "react"

/**
 * Hook to handle Safari PWA (Progressive Web App) visibility issues.
 *
 * Safari on iOS aggressively suspends/resumes web apps when added to home screen.
 * This can cause:
 * 1. Stale CSS transforms from dnd-kit that don't recalculate on resume
 * 2. Fixed positioned elements becoming disconnected from viewport
 * 3. Animation/transition states stuck in intermediate positions
 *
 * This hook detects when the app resumes from background and triggers
 * a layout recalculation to fix these issues.
 */

interface UseSafariPWAFixOptions {
  /** Callback to run when app becomes visible again */
  onResume?: () => void
  /** Whether to force a DOM layout recalculation */
  forceLayoutRecalc?: boolean
}

/**
 * Detects if the app is running as an iOS Safari PWA (added to home screen)
 */
export function isIOSPWA(): boolean {
  if (typeof window === "undefined") return false

  // Check for iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)

  // Check for standalone mode (added to home screen)
  const isStandalone =
    ('standalone' in window.navigator && (window.navigator as any).standalone) ||
    window.matchMedia('(display-mode: standalone)').matches

  return isIOS && isStandalone
}

/**
 * Forces browser to recalculate layout by triggering a reflow.
 * This fixes stale transforms and positioning issues in Safari PWA.
 */
export function forceLayoutRecalculation(): void {
  if (typeof document === "undefined") return

  // Method 1: Read a layout-dependent property to force reflow
  void document.body.offsetHeight

  // Method 2: Temporarily modify a style to trigger layout
  const root = document.documentElement
  root.style.display = "none"
  void root.offsetHeight // Force reflow
  root.style.display = ""
}

/**
 * Resets any stuck transforms on sortable items.
 * Safari PWA can leave dnd-kit transforms in stale states.
 */
export function resetSortableTransforms(): void {
  if (typeof document === "undefined") return

  // Find all elements that might have dnd-kit transforms applied
  // and reset them to ensure clean state
  const sortableItems = document.querySelectorAll('[style*="transform"]')
  sortableItems.forEach((el) => {
    const htmlEl = el as HTMLElement
    // Only reset transforms that look like dnd-kit transforms (translate)
    // but preserve intentional transforms like scale, rotate, etc.
    if (htmlEl.style.transform.includes('translate')) {
      // Check if this is a sortable item by looking at parent structure
      const hasTransition = htmlEl.style.transition?.includes('transform')
      if (hasTransition) {
        // Temporarily disable transition and reset transform
        const originalTransition = htmlEl.style.transition
        htmlEl.style.transition = 'none'
        htmlEl.style.transform = ''
        // Force reflow
        void htmlEl.offsetHeight
        // Restore transition
        htmlEl.style.transition = originalTransition
      }
    }
  })
}

/**
 * Hook that handles Safari PWA visibility changes and fixes UI issues.
 */
export function useSafariPWAFix(options: UseSafariPWAFixOptions = {}) {
  const { onResume, forceLayoutRecalc = true } = options
  const lastVisibilityState = useRef<DocumentVisibilityState>(
    typeof document !== "undefined" ? document.visibilityState : "visible"
  )
  const isPWA = useRef<boolean>(false)

  const handleVisibilityChange = useCallback(() => {
    if (typeof document === "undefined") return

    const currentState = document.visibilityState
    const wasHidden = lastVisibilityState.current === "hidden"
    const isNowVisible = currentState === "visible"

    // Update last state
    lastVisibilityState.current = currentState

    // Only act when transitioning from hidden to visible
    if (wasHidden && isNowVisible) {
      // Small delay to let Safari complete its resume process
      setTimeout(() => {
        // Reset any stuck transforms
        resetSortableTransforms()

        // Force layout recalculation if enabled
        if (forceLayoutRecalc) {
          forceLayoutRecalculation()
        }

        // Call user callback if provided
        onResume?.()
      }, 100)
    }
  }, [onResume, forceLayoutRecalc])

  // Handle pageshow event (Safari fires this when restoring from bfcache)
  const handlePageShow = useCallback((event: PageTransitionEvent) => {
    if (event.persisted) {
      // Page was restored from bfcache
      setTimeout(() => {
        resetSortableTransforms()
        if (forceLayoutRecalc) {
          forceLayoutRecalculation()
        }
        onResume?.()
      }, 100)
    }
  }, [onResume, forceLayoutRecalc])

  useEffect(() => {
    if (typeof window === "undefined") return

    // Check if running as iOS PWA
    isPWA.current = isIOSPWA()

    // Add event listeners
    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("pageshow", handlePageShow)

    // iOS Safari-specific: handle focus/blur as backup
    // Safari PWA sometimes doesn't fire visibilitychange reliably
    if (isPWA.current) {
      window.addEventListener("focus", handleVisibilityChange)
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("pageshow", handlePageShow)
      if (isPWA.current) {
        window.removeEventListener("focus", handleVisibilityChange)
      }
    }
  }, [handleVisibilityChange, handlePageShow])

  return {
    isIOSPWA: isPWA.current,
    forceRefresh: () => {
      resetSortableTransforms()
      forceLayoutRecalculation()
    },
  }
}
