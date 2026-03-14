import { NextRequest, NextResponse } from 'next/server'
import createClient from '@/lib/supabase-server'

/**
 * GET /api/analytics?tz=Asia/Jerusalem
 *
 * Returns all analytics data in a single response:
 * - summary metrics
 * - velocity chart (8 past weeks + current partial week)
 * - goal coverage panel
 * - task origins matrix
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()

  // Authenticate
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tz = request.nextUrl.searchParams.get('tz') || 'UTC'

  // Compute week boundaries in the user's timezone
  // ISO weeks start on Monday
  const now = new Date()
  const userNow = toZonedDate(now, tz)

  // Current week Monday 00:00 and Sunday 23:59:59 in user TZ
  const currentWeekMonday = getISOWeekMonday(userNow)
  const currentWeekSunday = new Date(currentWeekMonday)
  currentWeekSunday.setDate(currentWeekSunday.getDate() + 6)
  currentWeekSunday.setHours(23, 59, 59, 999)

  // 8 complete weeks before current week
  const eightWeeksAgoMonday = new Date(currentWeekMonday)
  eightWeeksAgoMonday.setDate(eightWeeksAgoMonday.getDate() - 8 * 7)

  // Convert to ISO strings for Supabase queries
  const currentWeekStart = toISOInTz(currentWeekMonday, tz)
  const currentWeekEnd = toISOInTz(currentWeekSunday, tz)
  const eightWeeksStart = toISOInTz(eightWeeksAgoMonday, tz)

  const userId = user.id

  // Fetch all tasks for this user (active + completed, not from backlog)
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, title, status, source_type, goal_id, created_at, completed_at')
    .eq('user_id', userId)

  if (tasksError) {
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
  }

  // Fetch goals for current week (created this week or active)
  const { data: goals, error: goalsError } = await supabase
    .from('goals')
    .select('id, title, status, created_at')
    .eq('user_id', userId)
    .in('status', ['active', 'at_risk'])

  if (goalsError) {
    return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 })
  }

  const allTasks = tasks || []
  const allGoals = goals || []

  // --- Summary Metrics ---
  const completedThisWeek = allTasks.filter(t =>
    t.completed_at && isInRange(t.completed_at, currentWeekStart, currentWeekEnd)
  ).length

  const addedThisWeek = allTasks.filter(t =>
    t.created_at && isInRange(t.created_at, currentWeekStart, currentWeekEnd)
  ).length

  // Weekly average: completed in 8 prior weeks / 8
  const priorWeekEnd = new Date(currentWeekMonday)
  priorWeekEnd.setMilliseconds(-1) // Sunday 23:59:59.999 of prior week
  const priorWeekEndStr = toISOInTz(priorWeekEnd, tz)

  const completedIn8Weeks = allTasks.filter(t =>
    t.completed_at && isInRange(t.completed_at, eightWeeksStart, priorWeekEndStr)
  ).length
  const weeklyAvg = Math.round(completedIn8Weeks / 8)

  // Active tasks (not completed)
  const activeTasks = allTasks.filter(t => t.status === 'active')
  const activeWithGoal = activeTasks.filter(t => t.goal_id != null).length
  const goalCoveragePct = activeTasks.length > 0
    ? Math.round((activeWithGoal / activeTasks.length) * 100)
    : 0
  const orphanCount = activeTasks.filter(t => t.goal_id == null).length

  // --- Velocity Chart ---
  const velocity: { week_label: string; added: number; completed: number }[] = []
  for (let i = -8; i <= 0; i++) {
    const weekMonday = new Date(currentWeekMonday)
    weekMonday.setDate(weekMonday.getDate() + i * 7)
    const weekSunday = new Date(weekMonday)
    weekSunday.setDate(weekSunday.getDate() + 6)
    weekSunday.setHours(23, 59, 59, 999)

    const wStart = toISOInTz(weekMonday, tz)
    const wEnd = toISOInTz(weekSunday, tz)
    const isoWeekNum = getISOWeekNumber(weekMonday)

    const added = allTasks.filter(t =>
      t.created_at && isInRange(t.created_at, wStart, wEnd)
    ).length
    const completed = allTasks.filter(t =>
      t.completed_at && isInRange(t.completed_at, wStart, wEnd)
    ).length

    velocity.push({ week_label: `W${isoWeekNum}`, added, completed })
  }

  // --- Goal Coverage Panel ---
  const goalCoverage = allGoals.map(g => {
    const linkedTasks = allTasks.filter(t => t.goal_id === g.id)
    const linkedTotal = linkedTasks.filter(t => t.status === 'active').length +
      linkedTasks.filter(t => t.completed_at && isInRange(t.completed_at, currentWeekStart, currentWeekEnd)).length
    const linkedCompleted = linkedTasks.filter(t =>
      t.completed_at && isInRange(t.completed_at, currentWeekStart, currentWeekEnd)
    ).length
    return {
      id: g.id,
      title: g.title,
      linked_total: linkedTotal,
      linked_completed: linkedCompleted,
    }
  })

  // --- Task Origins Matrix ---
  const sourceTypes = ['slack', 'granola', 'manual'] as const
  type SourceKey = typeof sourceTypes[number]

  const getSource = (t: { source_type: string | null }): SourceKey =>
    (t.source_type === 'slack' || t.source_type === 'granola') ? t.source_type : 'manual'

  const goalsMatrix = allGoals.map(g => {
    const linked = activeTasks.filter(t => t.goal_id === g.id)
    const counts: Record<SourceKey, number> = { slack: 0, granola: 0, manual: 0 }
    for (const t of linked) counts[getSource(t)]++
    const truncTitle = g.title.length > 22 ? g.title.slice(0, 22) + '\u2026' : g.title
    return {
      goal_id: g.id,
      goal_title: truncTitle,
      slack: counts.slack,
      granola: counts.granola,
      manual: counts.manual,
      total: linked.length,
    }
  })

  const noGoalTasks = activeTasks.filter(t => t.goal_id == null)
  const noGoalCounts: Record<SourceKey, number> = { slack: 0, granola: 0, manual: 0 }
  for (const t of noGoalTasks) noGoalCounts[getSource(t)]++

  return NextResponse.json({
    summary: {
      completed_this_week: completedThisWeek,
      added_this_week: addedThisWeek,
      weekly_avg: weeklyAvg,
      goal_coverage_pct: goalCoveragePct,
      orphan_count: orphanCount,
    },
    velocity,
    goal_coverage: goalCoverage,
    origins_matrix: {
      goals: goalsMatrix,
      no_goal: {
        slack: noGoalCounts.slack,
        granola: noGoalCounts.granola,
        manual: noGoalCounts.manual,
        total: noGoalTasks.length,
      },
    },
  })
}

// --- Helpers ---

/** Get a Date representing "now" in the user's timezone (as local values) */
function toZonedDate(date: Date, tz: string): Date {
  const str = date.toLocaleString('en-US', { timeZone: tz })
  return new Date(str)
}

/** Get Monday 00:00 of the ISO week containing `date` */
function getISOWeekMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  // JS: 0=Sun, 1=Mon, ..., 6=Sat. ISO: 1=Mon, ..., 7=Sun
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Get ISO week number */
function getISOWeekNumber(date: Date): number {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  // Set to nearest Thursday: current date + 4 - current day number (Mon=1, Sun=7)
  const day = d.getDay()
  const isoDay = day === 0 ? 7 : day
  d.setDate(d.getDate() + 4 - isoDay)
  const yearStart = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/** Convert a local Date to an ISO-ish string for comparison with UTC timestamps */
function toISOInTz(_date: Date, _tz: string): string {
  return _date.toISOString()
}

/** Check if a timestamp string falls within a range */
function isInRange(timestamp: string, start: string, end: string): boolean {
  const t = normalizeTimestamp(timestamp)
  return t >= start && t <= end
}

/** Normalize Supabase timestamps (append Z if missing) */
function normalizeTimestamp(ts: string): string {
  if (!ts.endsWith('Z') && !ts.includes('+') && !ts.includes('-', 10)) {
    return ts + 'Z'
  }
  return ts
}
