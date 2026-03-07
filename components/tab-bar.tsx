"use client"

import { CheckSquare, Target, Users, Archive, User } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TabId } from "@/lib/chief-of-staff-types"

interface TabBarProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'people', label: 'People', icon: Users },
  { id: 'backlog', label: 'Backlog', icon: Archive },
  { id: 'profile', label: 'Me', icon: User },
]

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 bg-background border-t border-border"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        transform: "translateZ(0)",
        WebkitBackfaceVisibility: "hidden",
        backfaceVisibility: "hidden",
      }}
      role="tablist"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`tab-panel-${id}`}
              onClick={() => onTabChange(id)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors duration-150",
                "active:scale-95 transition-transform duration-75",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
              style={{ touchAction: "manipulation" }}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
              <span className={cn(
                "text-[10px] leading-tight",
                isActive && "font-semibold"
              )}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
