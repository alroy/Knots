import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { verifyWebhookJWT } from '@/lib/monday/oauth'
import { fetchItem, extractAssigneeIds, buildItemDescription } from '@/lib/monday/api'
import { createTaskFromSource } from '@/lib/slack/ingest/create-task'
import { linkTaskToGoal } from '@/lib/slack/ingest/link-goal'
import type { TaskFromSourceInput } from '@/lib/slack/ingest/types'

/**
 * Monday.com webhook event handler
 *
 * Handles:
 * - Challenge verification (initial webhook setup)
 * - Column value changes on Person columns (assignment events)
 */
export async function POST(request: NextRequest) {
  if (process.env.MONDAY_FEATURE_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Monday.com integration disabled' }, { status: 404 })
  }

  const signingSecret = process.env.MONDAY_SIGNING_SECRET
  if (!signingSecret) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const rawBody = await request.text()

  // Verify webhook JWT if present
  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    const jwt = verifyWebhookJWT(authHeader, signingSecret)
    if (!jwt) {
      console.error('Monday webhook JWT verification failed')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
    console.log('Monday webhook JWT verified:', { accountId: jwt.accountId, userId: jwt.userId })
  }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Handle challenge verification (Monday sends this on webhook registration)
  if (body.challenge) {
    return NextResponse.json({ challenge: body.challenge })
  }

  const event = body.event
  if (!event) {
    return NextResponse.json({ ok: true })
  }

  // We only care about column value changes (assignments)
  // Monday sends different event types; we handle change_column_value
  const { type, columnType, pulseId, boardId, value } = event

  // Only process Person column changes
  if (columnType !== 'people' && columnType !== 'multiple-person') {
    return NextResponse.json({ ok: true, skipped: 'not_person_column' })
  }

  // Extract newly assigned person IDs from the new value
  let assignedIds: string[] = []
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    const persons = parsed?.personsAndTeams || []
    assignedIds = persons
      .filter((p: any) => p.kind === 'person')
      .map((p: any) => String(p.id))
  } catch {
    console.error('Failed to parse Monday person column value:', value)
    return NextResponse.json({ ok: true, skipped: 'parse_error' })
  }

  if (assignedIds.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no_assignees' })
  }

  const supabase = createAdminClient()

  // Find Knots users who match these Monday user IDs
  const { data: connections } = await supabase
    .from('monday_connections')
    .select('user_id, account_id, monday_user_id, access_token')
    .in('monday_user_id', assignedIds)
    .is('revoked_at', null)

  if (!connections || connections.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no_matching_users' })
  }

  const results = []

  for (const conn of connections) {
    const itemId = String(pulseId)

    // Fetch full item details from Monday API
    const item = await fetchItem(conn.access_token, itemId)
    if (!item) {
      results.push({ userId: conn.user_id, error: 'item_fetch_failed' })
      continue
    }

    const description = buildItemDescription(item)
    const sourceId = `${conn.account_id}:${item.board.id}:${item.id}`

    const taskInput: TaskFromSourceInput = {
      user_id: conn.user_id,
      title: item.name,
      description,
      source_type: 'monday',
      source_id: sourceId,
      source_url: item.url,
      ingest_trigger: 'assignment',
    }

    const result = await createTaskFromSource(supabase, taskInput)

    if (result.success && result.taskId && !result.deduped) {
      // Fire-and-forget goal linking
      linkTaskToGoal(
        supabase,
        result.taskId,
        conn.user_id,
        item.name,
        description
      ).catch((err) => console.error('Goal linking failed:', err))
    }

    results.push({
      userId: conn.user_id,
      taskId: result.taskId,
      deduped: result.deduped,
      success: result.success,
    })
  }

  return NextResponse.json({ ok: true, results })
}
