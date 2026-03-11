import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import createClient from '@/lib/supabase-server'

const SYSTEM_PROMPT = `You are an AI that extracts weekly goals from a meeting transcript or notes.

The transcript may contain multiple dated entries (e.g., "January 18 2026" followed by numbered items). Each entry represents a weekly check-in.

Parse the transcript and return a JSON object:

{
  "goals": [
    {
      "title": "string - concise goal name (action-oriented, max ~10 words)",
      "description": "string - success criteria and context from the transcript",
      "priority": 1,
      "risks": "string - dependencies, risks, or blockers mentioned",
      "entry_date": "string - the date header this goal was listed under, in YYYY-MM-DD format, or empty string if unclear"
    }
  ]
}

Rules:
- Extract actionable goals and work items, NOT status updates or observations
- Each numbered item (or clear sub-item) that represents work to be done should become a goal
- Assign priority: 1 (P0) for urgent/critical items, 2 (P1) for important items, 3 (P2) for lower priority
- For risks, include any mentioned dependencies, blockers, people to coordinate with, or unknowns
- Tighten language: make titles concise and action-oriented (e.g., "Create playbook for LE based on general playbook" not "I Solution review: DCAP - Playbook for LE...")
- Put fuller context from the transcript into the description field
- entry_date should be the date heading the goal appeared under (e.g., "January 18 2026" → "2026-01-18")
- If a single numbered item has multiple sub-items that are each separate goals, extract them separately
- Return ONLY valid JSON, no markdown code blocks or other formatting`

/**
 * Find best match for an item in existing items by comparing lowercase titles.
 */
function findMatch<T extends { id: string }>(
  parsedValue: string,
  existingItems: T[],
  getField: (item: T) => string
): T | null {
  if (!parsedValue) return null
  const normalizedParsed = parsedValue.toLowerCase().trim()

  const exact = existingItems.find(item => getField(item).toLowerCase().trim() === normalizedParsed)
  if (exact) return exact

  const substringMatch = existingItems.find(item => {
    const existing = getField(item).toLowerCase().trim()
    return existing.includes(normalizedParsed) || normalizedParsed.includes(existing)
  })
  return substringMatch || null
}

/**
 * Merge parsed fields into existing record, only overwriting with non-empty values.
 */
function mergeFields(existing: Record<string, any>, parsed: Record<string, any>, fields: string[]): Record<string, any> {
  const updates: Record<string, any> = {}
  for (const field of fields) {
    const newVal = parsed[field]
    if (newVal && newVal !== '') {
      updates[field] = newVal
    }
  }
  return updates
}

/**
 * Compute a 1-week deadline from a date string (YYYY-MM-DD) or fall back to today + 7 days.
 */
function computeWeeklyDeadline(entryDate: string | undefined): string {
  let base: Date
  if (entryDate && /^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
    base = new Date(entryDate + 'T00:00:00')
    if (isNaN(base.getTime())) base = new Date()
  } else {
    base = new Date()
  }
  base.setDate(base.getDate() + 7)
  return base.toISOString().split('T')[0]
}

export async function POST(request: NextRequest) {
  try {
    const { transcript } = await request.json()

    if (!transcript || typeof transcript !== 'string') {
      return NextResponse.json({ error: 'Transcript is required' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const anthropic = new Anthropic({ apiKey })
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Extract weekly goals from this transcript:\n\n${transcript}`,
        },
      ],
    })

    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')

    let parsed: any
    try {
      parsed = JSON.parse(responseText)
    } catch {
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1])
      } else {
        throw new Error('Failed to parse AI response as JSON')
      }
    }

    const existingGoals = await supabase.from('goals').select('*').eq('user_id', user.id)

    let goalsCreated = 0, goalsUpdated = 0
    if (parsed.goals?.length > 0) {
      const existing = existingGoals.data || []
      for (const g of parsed.goals) {
        const deadline = computeWeeklyDeadline(g.entry_date)
        const match = findMatch(g.title, existing, (item: any) => item.title)
        if (match) {
          const updates = mergeFields(match, {
            description: g.description || '',
            priority: g.priority || undefined,
            deadline,
            risks: g.risks || '',
          }, ['description', 'priority', 'deadline', 'risks'])

          if (Object.keys(updates).length > 0) {
            const { error } = await supabase.from('goals').update(updates).eq('id', match.id)
            if (!error) goalsUpdated++
            else console.error('Error updating goal:', error)
          }
        } else {
          const { error } = await supabase.from('goals').insert({
            user_id: user.id,
            title: g.title || '',
            description: g.description || '',
            priority: g.priority || 2,
            deadline,
            risks: g.risks || '',
            position: 0,
          })
          if (!error) goalsCreated++
          else console.error('Error inserting goal:', error)
        }
      }
    }

    return NextResponse.json({
      success: true,
      summary: { goalsCreated, goalsUpdated },
    })
  } catch (error: any) {
    console.error('Error parsing goals transcript:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to parse transcript' },
      { status: 500 }
    )
  }
}
