"use client"

import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { Sparkles, ChevronDown, ChevronUp, RefreshCw, ArrowUpDown, AlertTriangle, Lightbulb } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface MorningBriefContent {
  greeting: string
  focusAreas: string[]
  prioritizedTaskIds: string[]
  risks: string[]
  suggestions: string[]
  generatedAt: string
}

interface MorningBriefProps {
  onApplyOrder: (taskIds: string[]) => void
  /** Increment to trigger a debounced refresh (e.g., after task delete/toggle/goal change) */
  revision?: number
}

export function MorningBrief({ onApplyOrder, revision = 0 }: MorningBriefProps) {
  const [brief, setBrief] = useState<MorningBriefContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetchBrief()
  }, [])

  // Auto-refresh when revision changes (debounced 5s)
  useEffect(() => {
    if (revision === 0) return // skip initial
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      fetchBrief(true)
    }, 5000)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [revision])

  const fetchBrief = async (forceRefresh = false) => {
    try {
      if (forceRefresh) setIsRefreshing(true)
      else setLoading(true)
      setError('')

      const url = forceRefresh ? '/api/morning-brief?refresh=1' : '/api/morning-brief'
      const res = await fetch(url)

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        // Don't show error for missing API key — just hide the brief
        if (res.status === 500 && data.error?.includes('ANTHROPIC_API_KEY')) {
          setBrief(null)
          return
        }
        throw new Error(data.error || 'Failed to load brief')
      }

      const data = await res.json()
      setBrief(data.brief)
    } catch (err: any) {
      setError(err.message || 'Failed to load morning brief')
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }

  // Don't render anything while loading or if no brief (e.g., no API key)
  if (loading) {
    return (
      <div className="rounded-lg bg-accent/50 p-4 mb-6 animate-pulse">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary/50" />
          <div className="h-4 w-48 bg-accent rounded" />
        </div>
      </div>
    )
  }

  if (!brief || error) return null

  return (
    <div className="rounded-lg bg-accent/50 border border-border/50 p-4 mb-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{brief.greeting}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => fetchBrief(true)}
            disabled={isRefreshing}
            className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground transition-colors"
            aria-label="Refresh brief"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground transition-colors"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Focus areas — always visible */}
      <div className="mt-3 ml-6">
        <ul className="space-y-1.5">
          {brief.focusAreas.map((area, i) => (
            <li key={i} className="text-sm text-foreground flex items-start gap-2">
              <span className="text-primary font-bold text-xs mt-0.5">{i + 1}.</span>
              <span>{area}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-4 ml-6 space-y-4">
          {/* Risks */}
          {brief.risks.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Watch out</span>
              </div>
              <ul className="space-y-1">
                {brief.risks.map((risk, i) => (
                  <li key={i} className="text-sm text-foreground">{risk}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggestions */}
          {brief.suggestions.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Suggestions</span>
              </div>
              <ul className="space-y-1">
                {brief.suggestions.map((suggestion, i) => (
                  <li key={i} className="text-sm text-foreground">{suggestion}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Apply order button */}
          {brief.prioritizedTaskIds.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onApplyOrder(brief.prioritizedTaskIds)}
              className="text-xs h-7 gap-1.5"
            >
              <ArrowUpDown className="h-3 w-3" />
              Apply suggested order
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
