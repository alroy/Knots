import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase-admin'
import { createTaskFromSource } from '@/lib/slack/ingest/create-task'
import { createHash } from 'crypto'
import type { TaskFromSourceInput } from '@/lib/slack/ingest/types'

const SYSTEM_PROMPT = `You extract action items from meeting transcripts.

Given a meeting transcript, identify concrete action items — tasks someone committed to doing, was asked to do, or that clearly need to happen based on the discussion.

Return a JSON array of action items:
[
  {
    "title": "concise task title, 3-80 chars, imperative voice",
    "description": "relevant context from the meeting so the task is actionable on its own",
    "confidence": 0.0-1.0,
    "why": "brief reason this is an action item"
  }
]

Rules:
- Only include clear, actionable tasks — not observations, decisions, or FYIs
- Use imperative voice for titles (e.g., "Review Q3 budget proposal")
- If no action items are found, return an empty array []
- Return ONLY valid JSON, no markdown code blocks`

interface GranolaPayload {
  transcript: string
  meeting_title?: string
  meeting_url?: string
  meeting_id?: string
}

interface ActionItem {
  title: string
  description: string
  confidence: number
  why: string
}

export async function POST(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get('authorization')
  const webhookSecret = process.env.ZAPIER_WEBHOOK_SECRET
  if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = process.env.ZAPIER_USER_ID
  if (!userId) {
    return NextResponse.json({ error: 'ZAPIER_USER_ID not configured' }, { status: 500 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  try {
    const body: GranolaPayload = await request.json()

    if (!body.transcript || typeof body.transcript !== 'string') {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 })
    }

    // Build user message with optional meeting title for context
    let userMessage = body.meeting_title
      ? `Meeting: ${body.meeting_title}\n\n${body.transcript}`
      : body.transcript

    // Call Claude to extract action items
    const anthropic = new Anthropic({ apiKey })
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    // Extract text from response
    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')

    // Parse JSON (handle potential markdown code blocks)
    let items: ActionItem[]
    try {
      items = JSON.parse(responseText)
    } catch {
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        items = JSON.parse(jsonMatch[1])
      } else {
        return NextResponse.json({ error: 'Failed to parse LLM response' }, { status: 502 })
      }
    }

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'LLM returned non-array response' }, { status: 502 })
    }

    // Create tasks
    const supabase = createAdminClient()
    let tasksCreated = 0
    let tasksSkipped = 0
    const createdTasks: { title: string; deduped: boolean }[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item.title) continue

      // Build source_id for dedup
      const sourceId = body.meeting_id
        ? `granola:${body.meeting_id}:${i}`
        : `granola:${createHash('sha256').update(item.title).digest('hex').substring(0, 16)}`

      const input: TaskFromSourceInput = {
        user_id: userId,
        title: item.title.substring(0, 200),
        description: item.description || '',
        source_type: 'granola',
        source_id: sourceId,
        source_url: body.meeting_url || '',
        llm_confidence: item.confidence,
        llm_why: item.why,
        ingest_trigger: 'zapier',
      }

      const result = await createTaskFromSource(supabase, input)
      if (result.deduped) {
        tasksSkipped++
      } else if (result.success) {
        tasksCreated++
      }
      createdTasks.push({ title: item.title, deduped: result.deduped })
    }

    return NextResponse.json({
      success: true,
      tasks_created: tasksCreated,
      tasks_skipped: tasksSkipped,
      tasks: createdTasks,
    })
  } catch (error) {
    console.error('Granola ingest error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
