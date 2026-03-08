/**
 * Goal Linking Module
 *
 * Matches newly created tasks to existing goals using LLM classification.
 * Called after task creation in the Slack pipeline.
 */

import Anthropic from '@anthropic-ai/sdk'
import { SupabaseClient } from '@supabase/supabase-js'

interface GoalSummary {
  id: string
  title: string
  description: string
  priority: number
}

export interface GoalMatchResult {
  goalId: string | null
  confidence: number
}

/**
 * Fetch active goals for a user
 */
export async function fetchActiveGoals(
  supabase: SupabaseClient,
  userId: string
): Promise<GoalSummary[]> {
  const { data, error } = await supabase
    .from('goals')
    .select('id, title, description, priority')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('priority', { ascending: true })

  if (error) {
    console.error('Error fetching goals for linking:', error)
    return []
  }

  return (data || []).map((g: any) => ({
    id: g.id,
    title: g.title,
    description: g.description || '',
    priority: g.priority,
  }))
}

/**
 * Match a task to the most relevant goal using Claude Haiku.
 *
 * Returns the matched goal_id and confidence, or null if no match.
 * Only links if confidence >= 0.7.
 */
export async function matchTaskToGoal(
  taskTitle: string,
  taskDescription: string,
  goals: GoalSummary[]
): Promise<GoalMatchResult> {
  if (goals.length === 0) {
    return { goalId: null, confidence: 0 }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { goalId: null, confidence: 0 }
  }

  const priorityLabel: Record<number, string> = { 1: 'P0', 2: 'P1', 3: 'P2' }
  const goalsList = goals.map((g, i) =>
    `${i + 1}. [${priorityLabel[g.priority] || 'P2'}] ${g.title}${g.description ? ` — ${g.description.substring(0, 100)}` : ''}`
  ).join('\n')

  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: `You match tasks to goals. Given a list of goals and a task, determine which goal (if any) the task relates to. Return JSON only: { "goal_index": number | null, "confidence": number }. goal_index is 1-based. Set null if no goal matches. confidence is 0-1.`,
      messages: [{
        role: 'user',
        content: `Goals:\n${goalsList}\n\nTask: "${taskTitle}"\n${taskDescription ? `Description: "${taskDescription.substring(0, 200)}"` : ''}\n\nWhich goal does this task relate to? JSON only.`,
      }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    let jsonStr = raw.trim()
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim()

    const parsed = JSON.parse(jsonStr)
    const goalIndex = typeof parsed.goal_index === 'number' ? parsed.goal_index : null
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0

    if (goalIndex === null || confidence < 0.7) {
      return { goalId: null, confidence }
    }

    // goal_index is 1-based
    const matchedGoal = goals[goalIndex - 1]
    if (!matchedGoal) {
      return { goalId: null, confidence }
    }

    return { goalId: matchedGoal.id, confidence }
  } catch (error) {
    console.error('Goal linking LLM failed:', error)
    return { goalId: null, confidence: 0 }
  }
}

/**
 * Link a task to a goal if a match is found.
 * Called after task creation succeeds.
 */
export async function linkTaskToGoal(
  supabase: SupabaseClient,
  taskId: string,
  userId: string,
  taskTitle: string,
  taskDescription: string
): Promise<{ goalId: string | null; confidence: number }> {
  const goals = await fetchActiveGoals(supabase, userId)
  if (goals.length === 0) return { goalId: null, confidence: 0 }

  const result = await matchTaskToGoal(taskTitle, taskDescription, goals)

  if (result.goalId) {
    const { error } = await supabase
      .from('tasks')
      .update({ goal_id: result.goalId })
      .eq('id', taskId)

    if (error) {
      console.error('Error linking task to goal:', error)
      return { goalId: null, confidence: result.confidence }
    }
  }

  return result
}
