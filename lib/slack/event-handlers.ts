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
  shapeForwardedMessage,
  createForwardedFallback,
  shapeDMMessage,
  createDMFallback,
} from './ingest'

/**
 * Slack task metadata structure stored in tasks.metadata column
 */
export interface SlackTaskMetadata {
  source: {
    type: 'slack'
    subtype: 'dm' | 'mention'
    team_id: string
    channel_id: string
    message_ts: string
    permalink?: string
    /** Original message author (for forwarded messages, this is the original author, not the forwarder) */
    author?: {
      slack_user_id: string
      display_name?: string
    }
    /** Who forwarded the message to the bot DM (only present for forwarded messages) */
    forwarded_by?: {
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
 * Slack message attachment (for shared/forwarded messages)
 */
export interface SlackAttachment {
  fallback?: string
  text?: string
  pretext?: string
  author_name?: string
  author_id?: string
  author_link?: string
  from_url?: string
  is_msg_unfurl?: boolean
  channel_id?: string
  channel_name?: string
  ts?: string
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
  attachments?: SlackAttachment[]
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
 * Check if a DM message is a forwarded/shared message to the bot.
 *
 * Forwarded messages in Slack arrive as regular messages with attachments
 * containing the original message content. The event.text may be empty
 * (no user comment) or contain only a Slack link.
 */
export function isForwardedToBot(event: SlackMessageEvent): boolean {
  const isDM = event.channel_type === 'im' || event.channel.startsWith('D')
  if (!isDM) return false

  if (!event.attachments || event.attachments.length === 0) return false

  return event.attachments.some(
    (att) =>
      att.is_msg_unfurl === true ||
      (att.from_url != null && att.from_url.includes('.slack.com/archives/'))
  )
}

/**
 * Extract meaningful text from a forwarded/shared message.
 *
 * Combines the user's optional comment (event.text) with the
 * forwarded message content from attachments.
 */
export function extractForwardedText(event: SlackMessageEvent): string {
  const parts: string[] = []

  // User's comment on the forwarded message
  if (event.text && event.text.trim()) {
    parts.push(event.text.trim())
  }

  // Forwarded message content from attachments
  if (event.attachments) {
    for (const att of event.attachments) {
      if (att.is_msg_unfurl || att.from_url) {
        const content = att.text || att.fallback
        if (content && content.trim()) {
          parts.push(content.trim())
        }
        break
      }
    }
  }

  return parts.join('\n\n') || 'Forwarded message'
}

/**
 * Extracted details from a forwarded/shared Slack message attachment.
 */
export interface ForwardedOriginal {
  text: string
  author_id?: string
  author_name?: string
  channel_id?: string
  channel_name?: string
  ts?: string
  permalink?: string
  /** Which attachment field was used to identify the forward */
  extraction_cue: 'is_msg_unfurl' | 'from_url' | 'none'
}

/**
 * Extract the original message details from a forwarded/shared message.
 *
 * Inspects attachments for the original author, text, channel, and permalink.
 * Returns a structured object with all available provenance.
 */
export function extractForwardedOriginal(event: SlackMessageEvent): ForwardedOriginal {
  const fallback: ForwardedOriginal = {
    text: event.text?.trim() || 'Forwarded message',
    extraction_cue: 'none',
  }

  if (!event.attachments || event.attachments.length === 0) return fallback

  // Find the first forwarded-message attachment
  for (const att of event.attachments) {
    const isForward = att.is_msg_unfurl === true ||
      (att.from_url != null && att.from_url.includes('.slack.com/archives/'))

    if (!isForward) continue

    const text = att.text || att.fallback || event.text?.trim() || 'Forwarded message'
    const cue: ForwardedOriginal['extraction_cue'] = att.is_msg_unfurl ? 'is_msg_unfurl' : 'from_url'

    return {
      text,
      author_id: att.author_id,
      author_name: att.author_name,
      channel_id: att.channel_id,
      channel_name: att.channel_name,
      ts: att.ts,
      permalink: att.from_url,
      extraction_cue: cue,
    }
  }

  return fallback
}

/**
 * Check if this is a message we should create a task for
 */
export function shouldCreateTask(
  event: SlackMessageEvent,
  slackUserId: string
): { shouldCreate: boolean; reason: string; isDM: boolean; isMention: boolean; isForwarded: boolean } {
  // DMs always create tasks — manual, automation (n8n), bot_message subtypes.
  // Check DM first so bot_id/subtype/empty-text guards only apply to channels.
  const isDM = event.channel_type === 'im' || event.channel.startsWith('D')

  if (isDM) {
    // Forwarded DMs bypass subtype and empty-text checks.
    // Forwarding is explicit user intent — always create a task.
    if (isForwardedToBot(event)) {
      return { shouldCreate: true, reason: 'forwarded_dm', isDM: true, isMention: false, isForwarded: true }
    }

    // All other DMs — manual or automation (n8n, bot_message, etc.)
    return { shouldCreate: true, reason: 'dm', isDM: true, isMention: false, isForwarded: false }
  }

  // --- Non-DM (channel) messages below ---

  // Ignore bot messages in channels
  if (event.bot_id) {
    return { shouldCreate: false, reason: 'bot_message', isDM: false, isMention: false, isForwarded: false }
  }

  // Ignore message subtypes (edits, deletes, joins, etc) in channels
  if (event.subtype && event.subtype !== '') {
    return { shouldCreate: false, reason: `subtype_${event.subtype}`, isDM: false, isMention: false, isForwarded: false }
  }

  // Ignore empty messages in channels
  if (!event.text || event.text.trim() === '') {
    return { shouldCreate: false, reason: 'empty_text', isDM: false, isMention: false, isForwarded: false }
  }

  // Check if user is mentioned
  const mentionPattern = new RegExp(`<@${slackUserId}>`)
  const isMention = mentionPattern.test(event.text)

  if (isMention) {
    return { shouldCreate: true, reason: 'mention', isDM: false, isMention: true, isForwarded: false }
  }

  return { shouldCreate: false, reason: 'no_dm_or_mention', isDM: false, isMention: false, isForwarded: false }
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
  subtype: 'dm' | 'mention',
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
    const check = shouldCreateTask(event, slack_user_id)

    if (!check.shouldCreate) {
      continue
    }

    // Step 3.5: Forwarded DMs — create task unconditionally
    if (check.isForwarded) {
      // Extract original message details (author, text, permalink)
      const original = extractForwardedOriginal(event)
      const effectiveText = extractForwardedText(event)
      console.log(`Forwarded DM: extraction_cue=${original.extraction_cue}, author_id=${original.author_id || 'none'}, author_name=${original.author_name || 'none'}`)

      // Resolve original author display name via Slack API if we have an ID but no name
      let originalAuthorName = original.author_name
      let originalAuthorId = original.author_id
      if (access_token && originalAuthorId && !originalAuthorName) {
        try {
          const authorInfo = await fetchSlackUser(access_token, originalAuthorId)
          if (authorInfo?.display_name) {
            originalAuthorName = authorInfo.display_name
          }
        } catch {
          // Continue without resolved name
        }
      }

      // Resolve forwarder display name (event.user is the person who forwarded)
      let forwarderDisplayName: string | undefined
      if (access_token && event.user) {
        try {
          const forwarderInfo = await fetchSlackUser(access_token, event.user)
          if (forwarderInfo?.display_name) {
            forwarderDisplayName = forwarderInfo.display_name
          }
        } catch {
          // Continue without forwarder name
        }
      }

      // Resolve user mentions in the forwarded text
      let fwdUserMap: SlackUserMap = {}
      if (access_token && effectiveText) {
        try {
          fwdUserMap = await resolveUserMentions(access_token, effectiveText)
        } catch (error) {
          console.error('Failed to resolve user mentions for forwarded DM:', error)
        }
      }

      // Use LLM to shape forwarded content into a task (never vetoes creation)
      let fwdTitle: string
      let fwdDescription: string
      const shaped = await shapeForwardedMessage(effectiveText, originalAuthorName)
      if (shaped) {
        fwdTitle = shaped.title
        fwdDescription = shaped.description
      } else {
        // LLM unavailable or failed — use fallback
        const fallback = createForwardedFallback(effectiveText)
        fwdTitle = fallback.title
        fwdDescription = fallback.description
      }

      // Use the original message's permalink from the attachment for source_url
      const originalPermalink = original.permalink
      let fwdPermalink: string | undefined
      if (access_token) {
        const fetched = await ensurePermalink(access_token, event.channel, event.ts)
        if (fetched) fwdPermalink = fetched
      }
      const sourceUrl = originalPermalink || fwdPermalink || ''

      // Append source permalink to description
      if (sourceUrl && !fwdDescription.includes(sourceUrl)) {
        fwdDescription = fwdDescription
          ? `${fwdDescription}\n\nSource: ${sourceUrl}`
          : `Source: ${sourceUrl}`
      }

      // Deduplicate on the original forwarded message (not the DM ts).
      const sourceId = originalPermalink
        ? `fwd:${originalPermalink}`
        : `${team_id}:${event.channel}:${event.ts}`

      // Build metadata with ORIGINAL author (not forwarder)
      const fwdMetadata: SlackTaskMetadata = {
        source: {
          type: 'slack',
          subtype: 'dm',
          team_id,
          channel_id: event.channel,
          message_ts: event.ts,
          permalink: fwdPermalink || originalPermalink,
          // Original author — displayed on the card as "{name} via Slack"
          ...(originalAuthorId || originalAuthorName ? {
            author: {
              slack_user_id: originalAuthorId || 'unknown',
              ...(originalAuthorName ? { display_name: originalAuthorName } : {}),
            },
          } : {}),
          // Forwarder — who sent this to the bot DM
          ...(event.user ? {
            forwarded_by: {
              slack_user_id: event.user,
              ...(forwarderDisplayName ? { display_name: forwarderDisplayName } : {}),
            },
          } : {}),
        },
        raw: {
          slack_text: effectiveText,
        },
        ...(Object.keys(fwdUserMap).length > 0 ? { user_map: fwdUserMap } : {}),
      }

      const shouldStoreRaw = process.env.STORE_RAW_SLACK_TEXT === 'true'

      const { data: fwdTask, error: fwdError } = await supabase
        .from('tasks')
        .insert({
          title: fwdTitle,
          description: fwdDescription,
          status: 'active',
          user_id,
          position: 0,
          source_type: 'slack',
          source_id: sourceId,
          source_url: sourceUrl,
          ingest_trigger: 'dm',
          metadata: fwdMetadata,
          ...(shouldStoreRaw ? { raw_source_text: effectiveText } : {}),
        })
        .select('id')
        .single()

      // Unique constraint violation → deduplicated
      if (fwdError?.code === '23505') {
        await updateIngestStatus(supabase, team_id, event_id, 'ignored', undefined, 'deduped')
        return { status: 'ignored', reason: 'deduped' }
      }

      if (fwdError) {
        await updateIngestStatus(supabase, team_id, event_id, 'failed', undefined, fwdError.message)
        return { status: 'failed', error: fwdError.message }
      }

      await updateIngestStatus(supabase, team_id, event_id, 'processed', fwdTask.id)
      return { status: 'processed', taskId: fwdTask.id }
    }

    // Step 3.7: Non-forwarded DMs — always create task with LLM shaping
    if (check.isDM && !check.isForwarded) {
      const messageText = event.text?.trim() || ''

      // Fetch permalink for source tracking
      let dmPermalink: string | undefined
      if (access_token) {
        const fetched = await ensurePermalink(access_token, event.channel, event.ts)
        if (fetched) dmPermalink = fetched
      }

      // Resolve sender display name and user mentions
      let dmSenderName: string | undefined
      let dmUserMap: SlackUserMap = {}
      if (access_token) {
        if (messageText) {
          try {
            dmUserMap = await resolveUserMentions(access_token, messageText)
          } catch {
            // Continue without user map
          }
        }

        if (event.user) {
          if (dmUserMap[event.user]) {
            dmSenderName = dmUserMap[event.user]
          } else {
            try {
              const senderInfo = await fetchSlackUser(access_token, event.user)
              if (senderInfo?.display_name) {
                dmSenderName = senderInfo.display_name
                dmUserMap[event.user] = dmSenderName
              }
            } catch {
              // Continue without sender name
            }
          }
        }
      }

      // Call LLM to shape task content (never vetoes)
      let dmTitle: string
      let dmDescription: string
      let dmConfidence: number | undefined
      let dmWhy: string | undefined

      const shaped = await shapeDMMessage(messageText || 'Slack message', dmSenderName)
      if (shaped) {
        dmTitle = shaped.title
        dmDescription = shaped.description
        dmConfidence = shaped.confidence
        dmWhy = shaped.why
      } else {
        // LLM unavailable or failed — use deterministic fallback
        const fallback = createDMFallback(messageText || 'Slack message')
        dmTitle = fallback.title
        dmDescription = fallback.description
        dmConfidence = undefined
        dmWhy = fallback.why
      }

      // Enforce source link in description
      const sourceUrl = dmPermalink || ''
      if (sourceUrl && !dmDescription.includes(sourceUrl)) {
        dmDescription = dmDescription
          ? `${dmDescription}\n\nSource: ${sourceUrl}`
          : `Source: ${sourceUrl}`
      }

      // Source ID for deduplication
      const sourceId = `${team_id}:${event.channel}:${event.ts}`

      // Build metadata
      const dmMetadata: SlackTaskMetadata = {
        source: {
          type: 'slack',
          subtype: 'dm',
          team_id,
          channel_id: event.channel,
          message_ts: event.ts,
          ...(dmPermalink ? { permalink: dmPermalink } : {}),
          ...(event.user || dmSenderName ? {
            author: {
              slack_user_id: event.user || 'unknown',
              ...(dmSenderName ? { display_name: dmSenderName } : {}),
            },
          } : {}),
        },
        raw: {
          slack_text: messageText,
        },
        ...(Object.keys(dmUserMap).length > 0 ? { user_map: dmUserMap } : {}),
      }

      const shouldStoreRaw = process.env.STORE_RAW_SLACK_TEXT === 'true'

      const { data: dmTask, error: dmError } = await supabase
        .from('tasks')
        .insert({
          title: dmTitle,
          description: dmDescription,
          status: 'active',
          user_id,
          position: 0,
          source_type: 'slack',
          source_id: sourceId,
          source_url: sourceUrl,
          ingest_trigger: 'dm',
          metadata: dmMetadata,
          llm_confidence: dmConfidence,
          llm_why: dmWhy,
          ...(shouldStoreRaw ? { raw_source_text: messageText } : {}),
        })
        .select('id')
        .single()

      // Unique constraint violation → deduplicated
      if (dmError?.code === '23505') {
        await updateIngestStatus(supabase, team_id, event_id, 'ignored', undefined, 'deduped')
        return { status: 'ignored', reason: 'deduped' }
      }

      if (dmError) {
        await updateIngestStatus(supabase, team_id, event_id, 'failed', undefined, dmError.message)
        return { status: 'failed', error: dmError.message }
      }

      await updateIngestStatus(supabase, team_id, event_id, 'processed', dmTask.id)
      return { status: 'processed', taskId: dmTask.id }
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
