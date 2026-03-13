"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

interface StickyHeaderProps {
  title: string
  byline?: React.ReactNode
  actions?: React.ReactNode
  /** Extra className on the outer <header> */
  className?: string
}

export function StickyHeader({ title, byline, actions, className }: StickyHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <header
      className={cn(
        "sticky top-0 z-50",
        // Extend background into content-column gutters so cards are fully hidden
        "-mx-[var(--content-gutter)] px-[var(--content-gutter)]",
        "transition-all duration-300 ease-in-out",
        isScrolled
          ? "bg-background pb-3 shadow-[0_4px_15px_rgba(0,0,0,0.05)]"
          : "bg-transparent pb-0 shadow-[0_4px_15px_rgba(0,0,0,0)] mb-6 md:mb-8",
        className,
      )}
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <div className={cn("flex items-center", actions && "justify-between")}>
        <div className="min-w-0">
          <h1
            className={cn(
              "font-bold text-foreground transition-all duration-300 ease-in-out",
              isScrolled ? "text-[20px] leading-tight" : "text-2xl mb-2",
            )}
          >
            {title}
          </h1>
          {byline != null && (
            <div
              className={cn(
                "text-muted-foreground transition-all duration-300 ease-in-out",
                isScrolled
                  ? "opacity-0 max-h-0 overflow-hidden mt-0 pointer-events-none"
                  : "opacity-100 max-h-24",
              )}
            >
              {byline}
            </div>
          )}
        </div>
        {actions}
      </div>
    </header>
  )
}
