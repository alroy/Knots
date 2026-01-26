import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Slack event types we handle
 */
export interface SlackMessageEvent {
  type: 'message'
  subtype?: string
  channel: string
  channel_type?: string
  user?: string
  text?: string
  ts: string
  bot_id?: string
  team?: string
}

export interface SlackEventCallback {
  type: 'event_callback'
  token: string
  team_id: string
  api_app_id: string
  event: SlackMessageEvent
  event_id: string
  event_time: number
  authorizations?: Array<{
    user_id: string
  }>
}

export interface SlackUrlVerification {
  type: 'url_verification'
  token: string
  challenge: string
}

export type SlackEvent = SlackEventCallback | SlackUrlVerification

/**
 * Check if event is a URL verification challenge
 */
export function isUrlVerification(event: SlackEvent): event is SlackUrlVerification {
  return event.type === 'url_verification'
}

/**
 * Check if event is an event callback
 */
export function isEventCallback(event: SlackEvent): event is SlackEventCallback {
  return event.type === 'event_callback'
}

/**
 * Check if this is a message we should create a task for
 */
export function shouldCreateTask(
  event: SlackMessageEvent,
  slackUserId: string
): { shouldCreate: boolean; reason: string; isDM: boolean; isMention: boolean } {
  // Ignore bot messages
  if (event.bot_id) {
    return { shouldCreate: false, reason: 'bot_message', isDM: false, isMention: false }
  }

  // Ignore message subtypes (edits, deletes, joins, etc)
  if (event.subtype && event.subtype !== '') {
    return { shouldCreate: false, reason: `subtype_${event.subtype}`, isDM: false, isMention: false }
  }

  // Ignore empty messages
  if (!event.text || event.text.trim() === '') {
    return { shouldCreate: false, reason: 'empty_text', isDM: false, isMention: false }
  }

  // Check if it's a DM
  const isDM = event.channel_type === 'im' || event.channel.startsWith('D')

  // Check if user is mentioned
  const mentionPattern = new RegExp(`<@${slackUserId}>`)
  const isMention = mentionPattern.test(event.text)

  if (isDM) {
    return { shouldCreate: true, reason: 'dm', isDM: true, isMention: false }
  }

  if (isMention) {
    return { shouldCreate: true, reason: 'mention', isDM: false, isMention: true }
  }

  return { shouldCreate: false, reason: 'no_dm_or_mention', isDM: false, isMention: false }
}

/**
 * Extract task title from Slack message text
 */
export function extractTaskTitle(text: string, maxLength = 120): string {
  // Remove user mentions for cleaner title
  let title = text.replace(/<@[A-Z0-9]+>/g, '').trim()

  // Collapse whitespace
  title = title.replace(/\s+/g, ' ')

  // Truncate if needed
  if (title.length > maxLength) {
    title = title.substring(0, maxLength - 3) + '...'
  }

  return title || 'Slack message'
}

/**
 * Format task description with Slack context
 */
export function formatTaskDescription(
  text: string,
  senderName: string | undefined,
  channelType: 'dm' | 'mention',
  permalink?: string
): string {
  const maxTextLength = 2000
  const truncatedText = text.length > maxTextLength
    ? text.substring(0, maxTextLength) + '...'
    : text

  const parts: string[] = []

  // Add message text
  parts.push(truncatedText)

  // Add context
  const contextParts: string[] = []
  if (senderName) {
    contextParts.push(`From: ${senderName}`)
  }
  contextParts.push(`Source: Slack ${channelType === 'dm' ? 'DM' : 'mention'}`)

  if (permalink) {
    contextParts.push(`Link: ${permalink}`)
  }

  if (contextParts.length > 0) {
    parts.push('')
    parts.push('---')
    parts.push(contextParts.join(' | '))
  }

  return parts.join('\n')
}

/**
 * Result of processing a Slack event
 */
export interface ProcessEventResult {
  status: 'processed' | 'ignored' | 'duplicate' | 'failed'
  taskId?: string
  reason?: string
  error?: string
}

/**
 * Process a Slack event callback and create a task if appropriate
 */
export async function processSlackEvent(
  supabase: SupabaseClient,
  eventPayload: SlackEventCallback
): Promise<ProcessEventResult> {
  const { team_id, event_id, event_time, event } = eventPayload

  console.log('[Slack] Processing event:', {
    team_id,
    event_id,
    event_type: event.type,
    channel: event.channel,
    channel_type: event.channel_type,
    user: event.user,
    text_preview: event.text?.substring(0, 50),
    has_bot_id: !!event.bot_id,
    subtype: event.subtype,
  })

  // Step 1: Try to insert into ingest table (dedupe check)
  const { error: ingestError } = await supabase
    .from('slack_event_ingest')
    .insert({
      team_id,
      event_id,
      event_time,
      event_type: event.type,
      payload: eventPayload,
      status: 'received',
    })

  // If unique constraint violation, this is a duplicate
  if (ingestError?.code === '23505') {
    console.log('[Slack] Duplicate event, skipping:', event_id)
    return { status: 'duplicate', reason: 'event_already_processed' }
  }

  if (ingestError) {
    console.error('[Slack] Failed to insert event ingest:', ingestError)
    return { status: 'failed', error: ingestError.message }
  }

  // Step 2: Find active Slack connection for this team
  const { data: connections, error: connError } = await supabase
    .from('slack_connections')
    .select('user_id, slack_user_id')
    .eq('team_id', team_id)
    .is('revoked_at', null)

  console.log('[Slack] Found connections for team:', {
    team_id,
    connection_count: connections?.length ?? 0,
    connections: connections?.map(c => ({ user_id: c.user_id, slack_user_id: c.slack_user_id })),
  })

  if (connError) {
    console.error('[Slack] Error fetching connections:', connError)
    await updateIngestStatus(supabase, team_id, event_id, 'failed', undefined, connError.message)
    return { status: 'failed', error: connError.message }
  }

  if (!connections || connections.length === 0) {
    console.log('[Slack] No active connections for team:', team_id)
    await updateIngestStatus(supabase, team_id, event_id, 'ignored', undefined, 'no_active_connection')
    return { status: 'ignored', reason: 'no_active_connection' }
  }

  // Step 3: Check each connection for DM or mention
  for (const connection of connections) {
    const { user_id, slack_user_id } = connection
    const check = shouldCreateTask(event, slack_user_id)

    console.log('[Slack] shouldCreateTask result:', {
      slack_user_id,
      user_id,
      shouldCreate: check.shouldCreate,
      reason: check.reason,
      isDM: check.isDM,
      isMention: check.isMention,
    })

    if (!check.shouldCreate) {
      console.log('[Slack] Skipping task creation for connection:', { slack_user_id, reason: check.reason })
      continue
    }

    // Step 4: Create task for this user
    const title = extractTaskTitle(event.text || '')
    const description = formatTaskDescription(
      event.text || '',
      undefined, // Could resolve sender name with additional API call
      check.isDM ? 'dm' : 'mention'
    )

    console.log('[Slack] Creating task:', { user_id, title, description_length: description.length })

    // Get current max position to put task at top
    const { data: existingTasks } = await supabase
      .from('tasks')
      .select('position')
      .eq('user_id', user_id)
      .order('position', { ascending: true })
      .limit(1)

    const newPosition = 0

    // Shift existing tasks down (best effort - RPC may not exist)
    if (existingTasks && existingTasks.length > 0) {
      try {
        await supabase.rpc('increment_task_positions', { p_user_id: user_id })
      } catch {
        // RPC doesn't exist, positions will be managed by the main app
      }
    }

    const { data: newTask, error: taskError } = await supabase
      .from('tasks')
      .insert({
        title,
        description,
        status: 'active',
        user_id,
        position: newPosition,
      })
      .select('id')
      .single()

    if (taskError) {
      console.error('[Slack] Failed to create task:', taskError)
      await updateIngestStatus(supabase, team_id, event_id, 'failed', undefined, taskError.message)
      return { status: 'failed', error: taskError.message }
    }

    console.log('[Slack] Task created successfully:', { task_id: newTask.id, user_id })

    // Step 5: Update ingest record with task_id
    await updateIngestStatus(supabase, team_id, event_id, 'processed', newTask.id)

    return { status: 'processed', taskId: newTask.id }
  }

  // No matching connection found for DM/mention
  console.log('[Slack] No matching user found for DM/mention in team:', team_id)
  await updateIngestStatus(supabase, team_id, event_id, 'ignored', undefined, 'no_matching_user')
  return { status: 'ignored', reason: 'no_matching_user' }
}

/**
 * Helper to update ingest record status
 */
async function updateIngestStatus(
  supabase: SupabaseClient,
  teamId: string,
  eventId: string,
  status: string,
  taskId?: string,
  errorMessage?: string
) {
  await supabase
    .from('slack_event_ingest')
    .update({
      status,
      task_id: taskId,
      error_message: errorMessage,
    })
    .eq('team_id', teamId)
    .eq('event_id', eventId)
}
