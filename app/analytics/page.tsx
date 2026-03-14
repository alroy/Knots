"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import Script from "next/script"

// --- Types ---

interface Summary {
  completed_this_week: number
  added_this_week: number
  weekly_avg: number
  goal_coverage_pct: number
  orphan_count: number
}

interface VelocityWeek {
  week_label: string
  added: number
  completed: number
}

interface GoalCoverageItem {
  id: string
  title: string
  linked_total: number
  linked_completed: number
}

interface OriginsGoal {
  goal_id: string
  goal_title: string
  slack: number
  granola: number
  manual: number
  total: number
}

interface OriginsMatrix {
  goals: OriginsGoal[]
  no_goal: { slack: number; granola: number; manual: number; total: number }
}

interface AnalyticsData {
  summary: Summary
  velocity: VelocityWeek[]
  goal_coverage: GoalCoverageItem[]
  origins_matrix: OriginsMatrix
}

// --- Main Page ---

export default function AnalyticsPage() {
  const router = useRouter()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [chartReady, setChartReady] = useState(false)

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    fetch(`/api/analytics?tz=${encodeURIComponent(tz)}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load analytics')
        return res.json()
      })
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"
        strategy="afterInteractive"
        onReady={() => setChartReady(true)}
      />
      <main className="min-h-screen bg-background pb-8">
        {/* Header */}
        <div className="content-column pt-6 pb-4">
          <button
            onClick={() => router.push('/?tab=goals')}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Goals
          </button>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        </div>

        <div className="content-column space-y-6">
          {loading ? (
            <LoadingSkeleton />
          ) : error ? (
            <div className="rounded-lg bg-card p-6 text-center">
              <p className="text-destructive text-sm">{error}</p>
            </div>
          ) : data ? (
            <>
              <SummaryMetrics summary={data.summary} />
              <VelocityChart velocity={data.velocity} chartReady={chartReady} />
              <GoalCoveragePanel coverage={data.goal_coverage} orphanCount={data.summary.orphan_count} />
              <TaskOriginsMatrix matrix={data.origins_matrix} />
            </>
          ) : null}
        </div>
      </main>
    </>
  )
}

// --- Loading Skeleton ---

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-lg bg-card p-4 h-20">
            <div className="h-3 w-16 bg-border rounded mb-3" />
            <div className="h-6 w-10 bg-border rounded" />
          </div>
        ))}
      </div>
      {/* Chart */}
      <div className="rounded-lg bg-card p-4 h-56">
        <div className="h-3 w-24 bg-border rounded mb-4" />
        <div className="h-40 bg-border/50 rounded" />
      </div>
      {/* Goal coverage */}
      <div className="rounded-lg bg-card p-4 h-36">
        <div className="h-3 w-28 bg-border rounded mb-4" />
        <div className="space-y-3">
          <div className="h-4 bg-border/50 rounded" />
          <div className="h-4 bg-border/50 rounded w-3/4" />
        </div>
      </div>
      {/* Matrix */}
      <div className="rounded-lg bg-card p-4 h-32">
        <div className="h-3 w-20 bg-border rounded mb-4" />
        <div className="h-16 bg-border/50 rounded" />
      </div>
    </div>
  )
}

// --- Summary Metrics ---

function SummaryMetrics({ summary }: { summary: Summary }) {
  const metrics = [
    { label: "Completed", value: summary.completed_this_week, sub: "this week" },
    { label: "Added", value: summary.added_this_week, sub: "this week" },
    { label: "Avg / week", value: summary.weekly_avg, sub: "past 8 weeks" },
    { label: "Goal coverage", value: `${summary.goal_coverage_pct}%`, sub: "of active tasks" },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {metrics.map(m => (
        <div key={m.label} className="rounded-lg bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">{m.label}</p>
          <p className="text-2xl font-bold text-foreground">{m.value}</p>
          <p className="text-[11px] text-muted-foreground">{m.sub}</p>
        </div>
      ))}
    </div>
  )
}

// --- Velocity Chart ---

function VelocityChart({ velocity, chartReady }: { velocity: VelocityWeek[]; chartReady: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<any>(null)

  const renderChart = useCallback(() => {
    if (!canvasRef.current || !chartReady || velocity.length === 0) return
    const Chart = (window as any).Chart
    if (!Chart) return

    if (chartRef.current) {
      chartRef.current.destroy()
    }

    const COMPLETED_COLOR = '#1D9E75'
    const ADDED_COLOR = '#B4B2A9'

    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return

    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: velocity.map(w => w.week_label),
        datasets: [
          {
            label: 'Completed',
            data: velocity.map(w => w.completed),
            backgroundColor: COMPLETED_COLOR,
            borderRadius: 3,
            barPercentage: 0.7,
            categoryPercentage: 0.7,
          },
          {
            label: 'Added',
            data: velocity.map(w => w.added),
            backgroundColor: ADDED_COLOR,
            borderRadius: 3,
            barPercentage: 0.7,
            categoryPercentage: 0.7,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items: any[]) => items[0]?.label || '',
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 10 },
              color: '#888',
            },
            border: { display: false },
          },
          y: {
            beginAtZero: true,
            grid: {
              color: '#e5e5e5',
            },
            ticks: {
              font: { size: 10 },
              color: '#888',
              stepSize: 1,
            },
            border: { display: false },
          },
        },
      },
    })
  }, [velocity, chartReady])

  useEffect(() => {
    renderChart()
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [renderChart])

  return (
    <div className="rounded-lg bg-card p-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-4">
        Weekly Velocity
      </h2>
      <div className="h-48">
        <canvas ref={canvasRef} />
      </div>
      {/* Custom HTML legend */}
      <div className="flex items-center justify-center gap-6 mt-3">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#1D9E75' }} />
          <span className="text-xs text-muted-foreground">Completed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#B4B2A9' }} />
          <span className="text-xs text-muted-foreground">Added</span>
        </div>
      </div>
    </div>
  )
}

// --- Goal Coverage Panel ---

function GoalCoveragePanel({ coverage, orphanCount }: { coverage: GoalCoverageItem[]; orphanCount: number }) {
  return (
    <div className="rounded-lg bg-card p-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-4">
        Goal Coverage
      </h2>
      {coverage.length === 0 && orphanCount === 0 ? (
        <p className="text-sm text-muted-foreground">No active goals this week.</p>
      ) : (
        <div className="space-y-3">
          {coverage.map(g => {
            const pct = g.linked_total > 0
              ? Math.round((g.linked_completed / g.linked_total) * 100)
              : 0
            const isEmpty = g.linked_total === 0

            return (
              <div key={g.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-foreground truncate mr-2">{g.title}</span>
                  <span className={cn(
                    "text-xs font-medium tabular-nums shrink-0",
                    isEmpty || g.linked_completed === 0 ? "text-muted-foreground" : "text-foreground"
                  )}>
                    {g.linked_completed} / {g.linked_total}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-border overflow-hidden">
                  {!isEmpty && (
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  )}
                </div>
              </div>
            )
          })}

          {/* Orphan row */}
          {orphanCount > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <span className="text-sm italic text-muted-foreground">No goal assigned</span>
                <span
                  className="inline-flex items-center text-xs font-medium"
                  style={{ backgroundColor: '#FAEEDA', color: '#854F0B', borderRadius: '999px', padding: '2px 8px' }}
                >
                  {orphanCount}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --- Task Origins Matrix ---

function TaskOriginsMatrix({ matrix }: { matrix: OriginsMatrix }) {
  const sources = ['slack', 'granola', 'manual'] as const
  const sourceLabels: Record<string, string> = { slack: 'Slack', granola: 'Granola', manual: 'Manual' }

  const hasAnyData = matrix.goals.length > 0 || matrix.no_goal.total > 0

  if (!hasAnyData) {
    return (
      <div className="rounded-lg bg-card p-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-4">
          Task Origins
        </h2>
        <p className="text-sm text-muted-foreground">No active tasks to show.</p>
      </div>
    )
  }

  const Cell = ({ value }: { value: number }) => (
    <td className={cn(
      "px-3 py-2 text-right text-sm tabular-nums",
      value === 0 ? "text-muted-foreground/50" : "text-foreground"
    )}>
      {value === 0 ? "\u2014" : value}
    </td>
  )

  return (
    <div className="rounded-lg bg-card p-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-4">
        Task Origins
      </h2>
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-3 text-xs font-medium text-muted-foreground">Goal</th>
              {sources.map(s => (
                <th key={s} className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                  {sourceLabels[s]}
                </th>
              ))}
              <th className="text-right pl-3 py-2 text-xs font-medium text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody>
            {matrix.goals.map(g => (
              <tr key={g.goal_id} className="border-b border-border/50">
                <td className="py-2 pr-3 text-sm text-foreground truncate max-w-[180px]">{g.goal_title}</td>
                {sources.map(s => <Cell key={s} value={g[s]} />)}
                <td className="pl-3 py-2 text-right text-sm font-medium tabular-nums text-foreground">{g.total}</td>
              </tr>
            ))}
            {/* No goal row */}
            {matrix.no_goal.total > 0 && (
              <tr>
                <td className="py-2 pr-3 text-sm italic text-muted-foreground">No goal</td>
                {sources.map(s => <Cell key={s} value={matrix.no_goal[s]} />)}
                <td className="pl-3 py-2 text-right text-sm font-medium tabular-nums text-muted-foreground">
                  {matrix.no_goal.total}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
