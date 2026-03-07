import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import createClient from '@/lib/supabase-server'

export interface MorningBriefContent {
  greeting: string
  focusAreas: string[]
  prioritizedTaskIds: string[]
  risks: string[]
  suggestions: string[]
  generatedAt: string
}

function getTimeOfDayPeriod(date: Date): string {
  const hour = parseInt(
    date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Jerusalem' })
  )
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

export async function GET(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const currentTime = now.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Jerusalem',
    })
    const { searchParams } = new URL(request.url)
    const forceRefresh = searchParams.get('refresh') === '1'

    // Check for cached brief (less than 4 hours old) — skip if force refresh
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('morning_brief')
        .select('*')
        .eq('user_id', user.id)
        .eq('brief_date', today)
        .single()

      if (cached) {
        const cacheAge = Date.now() - new Date(cached.created_at).getTime()
        const fourHours = 4 * 60 * 60 * 1000
        const cachedPeriod = getTimeOfDayPeriod(new Date(cached.created_at))
        const currentPeriod = getTimeOfDayPeriod(now)
        if (cacheAge < fourHours && cachedPeriod === currentPeriod) {
          return NextResponse.json({ brief: cached.content, cached: true })
        }
      }
    }

    // Fetch all context in parallel
    const [tasksRes, goalsRes, backlogRes, profileRes] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, description, status, position, goal_id, created_at, source_type')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('position', { ascending: true }),
      supabase
        .from('goals')
        .select('id, title, description, priority, status, metrics, deadline, risks')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('priority', { ascending: true }),
      supabase
        .from('backlog')
        .select('id, title, description, category, status')
        .eq('user_id', user.id)
        .eq('status', 'open')
        .order('position', { ascending: true })
        .limit(20),
      supabase
        .from('user_profile')
        .select('name, role_title, ai_instructions')
        .eq('user_id', user.id)
        .single(),
    ])

    const tasks = tasksRes.data || []
    const goals = goalsRes.data || []
    const backlog = backlogRes.data || []
    const profile = profileRes.data

    // Build task-to-goal mapping
    const goalMap = new Map(goals.map((g: any) => [g.id, g.title]))
    const priorityLabel: Record<number, string> = { 1: 'P0', 2: 'P1', 3: 'P2' }

    // Format context for LLM
    const goalsText = goals.length > 0
      ? goals.map((g: any) => {
          const linkedTasks = tasks.filter((t: any) => t.goal_id === g.id)
          return `- [${priorityLabel[g.priority] || 'P2'}] ${g.title}${g.deadline ? ` (due ${g.deadline})` : ''}${g.risks ? ` ⚠ ${g.risks}` : ''} — ${linkedTasks.length} linked tasks`
        }).join('\n')
      : 'No active goals.'

    const tasksText = tasks.length > 0
      ? tasks.slice(0, 30).map((t: any) => {
          const goalName = t.goal_id && goalMap.has(t.goal_id) ? ` [→ ${goalMap.get(t.goal_id)}]` : ''
          const source = t.source_type ? ` (via ${t.source_type})` : ''
          return `- [${t.id}] ${t.title}${goalName}${source}`
        }).join('\n')
      : 'No active tasks.'

    const backlogText = backlog.length > 0
      ? backlog.slice(0, 15).map((b: any) => `- [${b.category}] ${b.title}`).join('\n')
      : 'No open backlog items.'

    const profileText = profile
      ? `${profile.name || 'User'}, ${profile.role_title || ''}${profile.ai_instructions ? `\nAI instructions: ${profile.ai_instructions}` : ''}`
      : 'No profile set.'

    const anthropic = new Anthropic({ apiKey })
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: `You are an AI Chief of Staff. Generate a concise brief to help the user prioritize their day.

You MUST respond with valid JSON only. No markdown, no explanation.

JSON Schema:
{
  "greeting": "string - one personal line; greet appropriately for the time of day (morning/afternoon/evening), reference something specific from their context",
  "focusAreas": ["string - top 3 things to focus on today, actionable and specific"],
  "prioritizedTaskIds": ["string - task IDs in recommended priority order for today (max 10)"],
  "risks": ["string - blockers, overdue items, or things that need immediate attention"],
  "suggestions": ["string - proactive recommendations based on goals and backlog"]
}

Rules:
- Focus areas should be tied to goals where possible
- Prioritize tasks that relate to P0 goals, have deadlines, or came from Slack (someone is waiting)
- Risks should flag overdue deadlines, at-risk goals, or too many tasks without goal alignment
- Suggestions should be actionable (e.g., "Consider resolving the open decision about X before your 1:1")
- Keep everything concise — this is a mobile screen
- Return ALL task IDs you reference in prioritizedTaskIds, in recommended order`,
      messages: [{
        role: 'user',
        content: `Generate my brief. Current date: ${today}, current time: ${currentTime}.

## Profile
${profileText}

## Active Goals
${goalsText}

## Active Tasks
${tasksText}

## Open Backlog
${backlogText}

JSON only.`,
      }],
    })

    const raw = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')

    let briefContent: MorningBriefContent
    try {
      let jsonStr = raw.trim()
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim()

      const parsed = JSON.parse(jsonStr)
      briefContent = {
        greeting: parsed.greeting || 'Hello.',
        focusAreas: Array.isArray(parsed.focusAreas) ? parsed.focusAreas : [],
        prioritizedTaskIds: Array.isArray(parsed.prioritizedTaskIds) ? parsed.prioritizedTaskIds : [],
        risks: Array.isArray(parsed.risks) ? parsed.risks : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        generatedAt: new Date().toISOString(),
      }
    } catch {
      briefContent = {
        greeting: 'Hello.',
        focusAreas: ['Review your active tasks and prioritize based on goals.'],
        prioritizedTaskIds: tasks.slice(0, 10).map((t: any) => t.id),
        risks: [],
        suggestions: [],
        generatedAt: new Date().toISOString(),
      }
    }

    // Cache the brief (upsert for today)
    await supabase
      .from('morning_brief')
      .upsert({
        user_id: user.id,
        brief_date: today,
        content: briefContent,
      }, { onConflict: 'user_id,brief_date' })

    return NextResponse.json({ brief: briefContent, cached: false })
  } catch (error: any) {
    console.error('Error generating morning brief:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate morning brief' },
      { status: 500 }
    )
  }
}
