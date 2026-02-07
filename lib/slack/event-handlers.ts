import { SupabaseClient } from '@supabase/supabase-js'
import { normalizeSlackText, deriveTitleFromSlackMessage } from './text-utils'
import { resolveUserMentions, SlackUserMap, fetchSlackUser } from './api'
import {
  normalizeSlackPayload,
  computeActionabilityScore,
  shouldCallLLM,
  getRequiredConfidence,
  classifySlackMention,
  createFallbackFromMessage,
  buildTaskInput,
  createTaskFromSource,
  ensurePermalink,
  generateSourceId,
} from './ingest'
import {
  isForwardedToBot,
  extractForwardedContent,
  generateForwardedSourceId,
  type SlackMessageEventExtended,
  type ForwardedDetectionResult,
} from './ingest/forwarded'

/**
 * Slack task metadata structure stored in tasks.metadata column
 */
export interface SlackTaskMetadata {
  source: {
    type: 'slack'
    subtype: 'dm' | 'mention' | 'forwarded_dm'
    team_id: string
    channel_id: string
    message_ts: string
    permalink?: string
    author?: {
      slack_user_id: string
      display_name?: string
    }
  }
  raw: {
    slack_text: string
  }
  /** Map of Slack user IDs to display names for rendering mentions */
  user_map?: SlackUserMap
}

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
 * Uses the text-utils deriveTitleFromSlackMessage for consistent normalization
 */
export function extractTaskTitle(text: string, userMap?: SlackUserMap, maxLength = 120): string {
  return deriveTitleFromSlackMessage(text, maxLength, userMap)
}

/**
 * Format task description from Slack message
 * Returns only the normalized message text - Slack context is stored in metadata
 */
export function formatTaskDescription(text: string, userMap?: SlackUserMap): string {
  const maxTextLength = 2000

  // Normalize Slack tokens for cleaner description
  const normalized = normalizeSlackText(text, userMap)

  // Truncate if needed
  if (normalized.length > maxTextLength) {
    return normalized.substring(0, maxTextLength - 3) + '...'
  }

  return normalized
}

/**
 * Build metadata object for a Slack-created task
 */
export function buildSlackMetadata(
  event: SlackMessageEvent,
  teamId: string,
  subtype: 'dm' | 'mention' | 'forwarded_dm',
  senderUserId?: string,
  senderDisplayName?: string,
  permalink?: string,
  userMap?: SlackUserMap
): SlackTaskMetadata {
  const metadata: SlackTaskMetadata = {
    source: {
      type: 'slack',
      subtype,
      team_id: teamId,
      channel_id: event.channel,
      message_ts: event.ts,
    },
    raw: {
      slack_text: event.text || '',
    },
  }

  // Add permalink if available
  if (permalink) {
    metadata.source.permalink = permalink
  }

  // Add author info if available
  if (senderUserId) {
    metadata.source.author = {
      slack_user_id: senderUserId,
    }
    if (senderDisplayName) {
      metadata.source.author.display_name = senderDisplayName
    }
  }

  // Add user map for resolving mentions in UI
  if (userMap && Object.keys(userMap).length > 0) {
    metadata.user_map = userMap
  }

  return metadata
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
 * Result of processing a mention with LLM
 */
interface MentionLLMResult {
  processed: boolean
  taskId?: string
  reason?: string
}

/**
 * Process a mention using the heuristic + LLM pipeline
 */
async function processMentionWithLLM(
  supabase: SupabaseClient,
  eventPayload: SlackEventCallback,
  userId: string,
  slackUserId: string,
  accessToken: string
): Promise<MentionLLMResult> {
  const { event, team_id } = eventPayload

  try {
    // Normalize the Slack payload
    const normalized = normalizeSlackPayload(
      eventPayload as Parameters<typeof normalizeSlackPayload>[0],
      { currentSlackUserId: slackUserId }
    )

    if (!normalized) {
      return { processed: false, reason: 'normalization_failed' }
    }

    // Fetch permalink
    if (accessToken) {
      const permalink = await ensurePermalink(
        accessToken,
        normalized.channel_id,
        normalized.message_ts
      )
      if (permalink) {
        normalized.permalink = permalink
      }
    }

    // Get sender display name
    if (accessToken && event.user) {
      try {
        const userInfo = await fetchSlackUser(accessToken, event.user)
        if (userInfo?.display_name) {
          normalized.user_name = userInfo.display_name
        }
      } catch {
        // Continue without user name
      }
    }

    // Compute actionability score
    const actionabilityResult = computeActionabilityScore(normalized)
    const score = actionabilityResult.score
    const sourceId = generateSourceId(normalized)

    // Log the decision
    const logDecision = async (
      llmCalled: boolean,
      llmIsTask: boolean | undefined,
      llmConfidence: number | undefined,
      decision: string
    ) => {
      try {
        await supabase.from('slack_mention_ingest_log').insert({
          source_id: sourceId,
          user_id: userId,
          actionability_score: score,
          llm_called: llmCalled,
          llm_is_task: llmIsTask,
          llm_confidence: llmConfidence,
          decision,
        })
      } catch (error) {
        console.error('Failed to log ingest decision:', error)
      }
    }

    // Check if we should call the LLM
    if (!shouldCallLLM(score)) {
      await logDecision(false, undefined, undefined, 'dropped_low_actionability')
      return { processed: true, reason: 'dropped_low_actionability' }
    }

    // Call LLM for classification
    const classificationResult = await classifySlackMention(normalized)

    let classification = classificationResult.classification
    let usedFallback = false

    // Handle LLM failure with fallback
    if (!classificationResult.success || !classification) {
      const fallback = createFallbackFromMessage(normalized)
      classification = {
        is_task: true,
        confidence: 0.5,
        title: fallback.title,
        description: fallback.description,
        why: fallback.llm_why,
      }
      usedFallback = true
    }

    // Check if LLM says it's not a task
    if (!classification.is_task) {
      await logDecision(true, false, classification.confidence, 'dropped_low_confidence')
      return { processed: true, reason: 'llm_not_task' }
    }

    // Check confidence threshold
    const requiredConfidence = getRequiredConfidence(score)
    if (classification.confidence < requiredConfidence) {
      await logDecision(true, true, classification.confidence, 'dropped_low_confidence')
      return { processed: true, reason: 'low_confidence' }
    }

    // Create task using the new pipeline
    const taskInput = buildTaskInput(userId, normalized, classification)
    const createResult = await createTaskFromSource(supabase, taskInput)

    if (createResult.deduped) {
      await logDecision(true, true, classification.confidence, 'deduped')
      return { processed: true, reason: 'deduped' }
    }

    if (!createResult.success) {
      return { processed: false, reason: createResult.error }
    }

    await logDecision(
      true,
      true,
      classification.confidence,
      usedFallback ? 'llm_failed_validation' : 'created'
    )

    return { processed: true, taskId: createResult.taskId }
  } catch (error) {
    console.error('Error in LLM mention processing:', error)
    return { processed: false, reason: 'llm_pipeline_error' }
  }
}

/**
 * Log entry for bot DM processing
 */
interface BotDMLog {
  channel_type: string
  is_forwarded: boolean
  forwarded_cues: Record<string, boolean>
  task_created: boolean
  deduped: boolean
  dedupe_key?: string
}

/**
 * Process a bot DM — task creation is guaranteed.
 *
 * Every message sent to the bot DM creates a task unconditionally.
 * Forwarding detection is used only to improve content extraction
 * (better title, original permalink, original author), never to gate.
 */
async function processForwardedDM(
  supabase: SupabaseClient,
  eventPayload: SlackEventCallback,
  userId: string,
  accessToken: string,
  detection: ForwardedDetectionResult
): Promise<ProcessEventResult> {
  const { event, team_id, event_id } = eventPayload
  const extendedEvent = event as unknown as SlackMessageEventExtended

  const log: BotDMLog = {
    channel_type: event.channel_type || 'im',
    is_forwarded: detection.isForwarded,
    forwarded_cues: { ...detection.cues },
    task_created: false,
    deduped: false,
  }

  try {
    // Extract content — forwarded detection improves quality but isn't required
    const content = detection.isForwarded
      ? extractForwardedContent(extendedEvent, detection)
      : { text: event.text || 'Slack message', authorName: undefined as string | undefined, authorId: event.user }

    // Resolve sender display name
    let senderDisplayName: string | undefined = content.authorName
    let senderUserId: string | undefined = content.authorId || event.user

    if (accessToken && senderUserId && !senderDisplayName) {
      try {
        const userInfo = await fetchSlackUser(accessToken, senderUserId)
        if (userInfo?.display_name) {
          senderDisplayName = userInfo.display_name
        }
      } catch {
        // Continue without display name
      }
    }

    // Resolve user mentions in text for clean display
    let userMap: SlackUserMap = {}
    if (accessToken && content.text) {
      try {
        userMap = await resolveUserMentions(accessToken, content.text)
        if (senderUserId && senderDisplayName) {
          userMap[senderUserId] = senderDisplayName
        }
      } catch {
        // Continue with empty map
      }
    }

    // Determine source URL: prefer original permalink, fallback to DM permalink
    let sourceUrl = detection.originalPermalink || ''
    if (!sourceUrl && accessToken) {
      try {
        const dmPermalink = await ensurePermalink(accessToken, event.channel, event.ts)
        if (dmPermalink) {
          sourceUrl = dmPermalink
        }
      } catch {
        // Continue without permalink
      }
    }

    // Generate dedupe source_id
    const sourceId = generateForwardedSourceId(team_id, extendedEvent, detection)
    log.dedupe_key = sourceId

    // Generate title/description from best available content
    const title = deriveTitleFromSlackMessage(content.text, 120, userMap)
    let description = normalizeSlackText(content.text, userMap)

    // Append source URL to description if available
    if (sourceUrl) {
      if (description) {
        description += `\n\nSource: ${sourceUrl}`
      } else {
        description = `Source: ${sourceUrl}`
      }
    }

    // Determine metadata subtype
    const metadataSubtype = detection.isForwarded ? 'forwarded_dm' as const : 'dm' as const

    // Build metadata
    const metadata = buildSlackMetadata(
      event,
      team_id,
      metadataSubtype,
      senderUserId,
      senderDisplayName,
      sourceUrl || undefined,
      userMap
    )

    // Create the task — this always happens, no gating
    const taskRow = {
      title,
      description,
      status: 'active' as const,
      user_id: userId,
      position: 0,
      source_type: 'slack' as const,
      source_id: sourceId,
      source_url: sourceUrl || null,
      ingest_trigger: detection.isForwarded ? 'forwarded_dm' : 'dm',
      metadata,
    }

    const { data: newTask, error: taskError } = await supabase
      .from('tasks')
      .insert(taskRow)
      .select('id')
      .single()

    if (taskError) {
      // Check for dedupe (unique constraint violation)
      if (taskError.code === '23505') {
        log.deduped = true
        console.log('[bot-dm] Deduplicated:', JSON.stringify(log))
        await updateIngestStatus(supabase, team_id, event_id, 'ignored', undefined, 'dm_deduped')
        return { status: 'ignored', reason: 'dm_deduped' }
      }

      log.task_created = false
      console.error('[bot-dm] Task creation failed:', taskError.message, JSON.stringify(log))
      await updateIngestStatus(supabase, team_id, event_id, 'failed', undefined, taskError.message)
      return { status: 'failed', error: taskError.message }
    }

    log.task_created = true
    console.log('[bot-dm] Task created:', JSON.stringify(log))
    await updateIngestStatus(supabase, team_id, event_id, 'processed', newTask.id)

    return { status: 'processed', taskId: newTask.id }
  } catch (error) {
    console.error('[bot-dm] Unexpected error:', error, JSON.stringify(log))
    await updateIngestStatus(supabase, team_id, event_id, 'failed', undefined, (error as Error).message)
    return { status: 'failed', error: (error as Error).message }
  }
}

/**
 * Process a Slack event callback and create a task if appropriate
 */
export async function processSlackEvent(
  supabase: SupabaseClient,
  eventPayload: SlackEventCallback
): Promise<ProcessEventResult> {
  const { team_id, event_id, event_time, event } = eventPayload

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
    return { status: 'duplicate', reason: 'event_already_processed' }
  }

  if (ingestError) {
    console.error('Failed to insert event ingest:', ingestError)
    return { status: 'failed', error: ingestError.message }
  }

  // Step 2: Find active Slack connection for this team (include access_token for API calls)
  const { data: connections, error: connError } = await supabase
    .from('slack_connections')
    .select('user_id, slack_user_id, access_token')
    .eq('team_id', team_id)
    .is('revoked_at', null)

  if (connError) {
    await updateIngestStatus(supabase, team_id, event_id, 'failed', undefined, connError.message)
    return { status: 'failed', error: connError.message }
  }

  if (!connections || connections.length === 0) {
    await updateIngestStatus(supabase, team_id, event_id, 'ignored', undefined, 'no_active_connection')
    return { status: 'ignored', reason: 'no_active_connection' }
  }

  // Step 3: Check each connection for DM or mention
  for (const connection of connections) {
    const { user_id, slack_user_id, access_token } = connection

    // --- Bot DM path: ALWAYS create a task ---
    // Any message sent to the bot DM is explicit user intent.
    // We skip the subtype/empty-text filters that shouldCreateTask applies.
    // Forwarding detection is used to improve content extraction, not to gate.
    const isDMChannel = event.channel_type === 'im' || event.channel.startsWith('D')
    if (isDMChannel) {
      // Skip messages from the bot itself (avoid self-loop)
      if (event.bot_id) {
        continue
      }

      const extendedEvent = event as unknown as SlackMessageEventExtended

      // Check if there's any content to create a task from
      const hasContent = !!(
        (event.text && event.text.trim()) ||
        (extendedEvent.attachments && extendedEvent.attachments.length > 0) ||
        (extendedEvent.blocks && extendedEvent.blocks.length > 0) ||
        (extendedEvent.files && (extendedEvent.files as unknown[]).length > 0)
      )

      if (!hasContent) {
        // Truly empty — nothing to make a task from
        await updateIngestStatus(supabase, team_id, event_id, 'ignored', undefined, 'dm_no_content')
        return { status: 'ignored', reason: 'dm_no_content' }
      }

      // Use forwarded detection for better content extraction
      const forwardDetection = isForwardedToBot(extendedEvent)

      console.log('[bot-dm] Processing bot DM:', JSON.stringify({
        channel: event.channel,
        subtype: event.subtype || null,
        has_text: !!(event.text && event.text.trim()),
        has_attachments: !!(extendedEvent.attachments && extendedEvent.attachments.length > 0),
        has_blocks: !!(extendedEvent.blocks && extendedEvent.blocks.length > 0),
        is_forwarded: forwardDetection.isForwarded,
        forwarded_cues: forwardDetection.cues,
      }))

      // Always route through processForwardedDM — it handles both
      // forwarded and non-forwarded content extraction and always creates a task.
      return processForwardedDM(
        supabase,
        eventPayload,
        user_id,
        access_token,
        forwardDetection
      )
    }
    // --- End bot DM path ---

    const check = shouldCreateTask(event, slack_user_id)

    if (!check.shouldCreate) {
      continue
    }

    // Step 4: For mentions, use the heuristic + LLM pipeline
    if (check.isMention && process.env.ANTHROPIC_API_KEY) {
      const result = await processMentionWithLLM(
        supabase,
        eventPayload,
        user_id,
        slack_user_id,
        access_token
      )

      if (result.processed) {
        if (result.taskId) {
          await updateIngestStatus(supabase, team_id, event_id, 'processed', result.taskId)
          return { status: 'processed', taskId: result.taskId }
        } else {
          await updateIngestStatus(supabase, team_id, event_id, 'ignored', undefined, result.reason)
          return { status: 'ignored', reason: result.reason }
        }
      }
      // If LLM pipeline failed, fall through to legacy behavior
    }

    // Step 5: Resolve user mentions to display names (for DMs or fallback)
    let userMap: SlackUserMap = {}
    let senderDisplayName: string | undefined

    if (access_token && event.text) {
      try {
        // Resolve all mentioned users in parallel
        userMap = await resolveUserMentions(access_token, event.text)

        // Get sender's display name if they're in the user map, otherwise fetch
        if (event.user) {
          if (userMap[event.user]) {
            senderDisplayName = userMap[event.user]
          } else {
            // Sender wasn't mentioned, fetch their info separately
            const senderInfo = await fetchSlackUser(access_token, event.user)
            if (senderInfo?.display_name) {
              senderDisplayName = senderInfo.display_name
              // Add to user map for consistency
              userMap[event.user] = senderDisplayName
            }
          }
        }
      } catch (error) {
        console.error('Failed to resolve user mentions:', error)
        // Continue with empty user map - will show @user fallback
      }
    }

    // Step 6: Create task for this user (DMs or fallback for mentions)
    const title = extractTaskTitle(event.text || '', userMap)
    const description = formatTaskDescription(event.text || '', userMap)
    const subtype = check.isDM ? 'dm' : 'mention'

    // Build metadata for Slack context (stored separately from description)
    const metadata = buildSlackMetadata(
      event,
      team_id,
      subtype,
      event.user, // sender's Slack user ID
      senderDisplayName,
      undefined, // permalink (could generate with additional API call)
      userMap
    )

    // Insert task at position 0 (top of list)
    // The database trigger (set_task_position_trigger) automatically shifts
    // existing tasks' positions when a new task is inserted at position 0
    const { data: newTask, error: taskError } = await supabase
      .from('tasks')
      .insert({
        title,
        description,
        status: 'active',
        user_id,
        position: 0,
        metadata,
      })
      .select('id')
      .single()

    if (taskError) {
      await updateIngestStatus(supabase, team_id, event_id, 'failed', undefined, taskError.message)
      return { status: 'failed', error: taskError.message }
    }

    // Step 7: Update ingest record with task_id
    await updateIngestStatus(supabase, team_id, event_id, 'processed', newTask.id)

    return { status: 'processed', taskId: newTask.id }
  }

  // No matching connection found for DM/mention
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
