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
  /** Slack message metadata (app-to-app signals, e.g. knots.granola) */
  metadata?: {
    event_type: string
    event_payload?: Record<string, unknown>
  }
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
 * A single pre-shaped task from the Granola payload
 */
export interface GranolaTask {
  title: string
  description?: string
  owner?: string | null
  due_hint?: string | null
  priority_hint?: string | null
  tags?: string[]
}

/**
 * Detected Granola context from Slack message metadata
 */
export interface GranolaContext {
  isGranola: true
  sourceUrl: string
  tasks: GranolaTask[]
  authorName?: string
  authorId?: string
}

/**
 * Detect if a Slack message carries Granola metadata (from n8n automation).
 *
 * Looks for `event.metadata.event_type === "knots.granola"` and extracts
 * the pre-shaped tasks array, source URL, and optional author info.
 *
 * The n8n workflow posts the Slack DM with metadata containing:
 *   event_type: "knots.granola"
 *   event_payload: {
 *     integration: { source_type: "granola", source_url: "https://notes.granola.ai/..." },
 *     tasks: [{ title, description, ... }, ...],
 *   }
 *
 * Returns null if not a Granola message or if required fields are missing.
 */
export function detectGranolaMetadata(event: SlackMessageEvent): GranolaContext | null {
  if (!event.metadata) return null
  if (event.metadata.event_type !== 'knots.granola') return null

  const payload = event.metadata.event_payload
  if (!payload) return null

  // Extract source URL from integration object or top-level granola_url
  const integration = payload.integration as Record<string, unknown> | undefined
  const sourceUrl = (integration?.source_url as string) || (payload.granola_url as string)
  if (typeof sourceUrl !== 'string' || !sourceUrl) {
    console.error('knots.granola metadata missing source_url, falling back to normal DM')
    return null
  }

  // Extract pre-shaped tasks array
  const rawTasks = payload.tasks as GranolaTask[] | undefined
  const tasks: GranolaTask[] = Array.isArray(rawTasks)
    ? rawTasks.filter(t => t && typeof t.title === 'string' && t.title.trim())
    : []

  return {
    isGranola: true,
    sourceUrl,
    tasks,
    authorName: typeof payload.granola_author_name === 'string' ? payload.granola_author_name : undefined,
    authorId: typeof payload.granola_author_id === 'string' ? payload.granola_author_id : undefined,
  }
}

/**
 * Detect if a DM is a Granola notification posted by n8n.
 *
 * These messages look like:
 *   "Granola tasks\n• Send email to Noah\n\nTranscript: https://notes.granola.ai/..."
 *
 * Slack may wrap URLs in angle brackets:
 *   "<https://notes.granola.ai/d/abc123>"
 *   "<https://notes.granola.ai/d/abc123|notes.granola.ai/d/abc123>"
 *
 * When metadata-based detection fails, the text-based check still identifies
 * the message as Granola so parseGranolaFromText can create tasks from it.
 */
export function isGranolaNotification(text: string): boolean {
  if (!text) return false
  // Must start with "Granola" (case-insensitive) and contain a notes.granola.ai URL
  // The URL regex matches both plain URLs and Slack-wrapped <URL|display> format
  return /^granola\b/i.test(text.trim()) && /notes\.granola\.ai\//i.test(text)
}

/**
 * Parse Granola tasks and URL from plain message text.
 *
 * Fallback for when Slack doesn't deliver message metadata: extracts
 * individual task titles from bullet-pointed lines and the Granola URL.
 *
 * Expected text format from n8n:
 *   "Granola tasks\n• Task one\n• Task two\n\nTranscript: https://notes.granola.ai/d/..."
 *
 * Handles Slack URL wrapping:
 *   <https://notes.granola.ai/d/abc123>
 *   <https://notes.granola.ai/d/abc123|display text>
 *
 * Returns null if no Granola URL found or no bullet points parsed.
 */
export function parseGranolaFromText(text: string): { sourceUrl: string; tasks: { title: string }[] } | null {
  if (!text) return null

  // Extract Granola URL — handle both plain and Slack-wrapped formats
  const urlMatch = text.match(/<?(https?:\/\/notes\.granola\.ai\/d\/[^\s>|]+)/)
  if (!urlMatch) return null

  const sourceUrl = urlMatch[1]

  // Parse bullet-pointed lines: • or - or * at start of line
  const lines = text.split('\n')
  const tasks: { title: string }[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    const bulletMatch = trimmed.match(/^[•\-*]\s+(.+)$/)
    if (bulletMatch) {
      const title = bulletMatch[1].trim()
      if (title) {
        tasks.push({ title })
      }
    }
  }

  if (tasks.length === 0) return null

  return { sourceUrl, tasks }
}

/**
 * Check if text contains a notes.granola.ai URL anywhere.
 *
 * Broader than isGranolaNotification (no prefix requirement).
 * Used as a safety net: if a DM contains a Granola URL but we couldn't
 * parse bullet points, block the regular DM path to prevent the LLM
 * from creating a garbage summarized task.
 */
export function hasGranolaUrl(text: string): boolean {
  if (!text) return false
  return /notes\.granola\.ai\//i.test(text)
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

    // Step 3.7: Non-forwarded DMs — Granola or regular DM
    if (check.isDM && !check.isForwarded) {
      const messageText = event.text?.trim() || ''

      // Diagnostic: log what metadata Slack actually delivers
      console.log('[DM] event.metadata:', JSON.stringify(event.metadata ?? null))
      console.log('[DM] event keys:', Object.keys(event).join(', '))

      // Detect Granola provenance from Slack message metadata
      const granolaCtx = detectGranolaMetadata(event)
      console.log('[DM] granolaCtx:', granolaCtx ? `found ${granolaCtx.tasks.length} tasks` : 'null')
      console.log('[DM] isGranolaNotification:', isGranolaNotification(messageText))

      // ── Granola path: create individual tasks from pre-shaped array ──
      if (granolaCtx && granolaCtx.tasks.length > 0) {
        const createdIds: string[] = []
        const errors: string[] = []

        for (const gTask of granolaCtx.tasks) {
          const title = gTask.title.trim()
          let description = gTask.description?.trim() || ''

          // Append source link
          if (granolaCtx.sourceUrl && !description.includes(granolaCtx.sourceUrl)) {
            description = description
              ? `${description}\n\nSource: ${granolaCtx.sourceUrl}`
              : `Source: ${granolaCtx.sourceUrl}`
          }

          // Dedup: granola:<url>:<title_hash> — unique per meeting per task
          const titleHash = simpleHash(title)
          const sourceId = `granola:${granolaCtx.sourceUrl}:${titleHash}`

          const metadata = {
            source: {
              type: 'granola' as const,
              granola_url: granolaCtx.sourceUrl,
              slack_team_id: team_id,
              slack_channel_id: event.channel,
              slack_message_ts: event.ts,
              ...(gTask.due_hint ? { due_hint: gTask.due_hint } : {}),
              ...(gTask.priority_hint ? { priority_hint: gTask.priority_hint } : {}),
              ...(gTask.tags && gTask.tags.length > 0 ? { tags: gTask.tags } : {}),
            },
            raw: { slack_text: messageText },
          }

          const { data: newTask, error: taskErr } = await supabase
            .from('tasks')
            .insert({
              title,
              description,
              status: 'active',
              user_id,
              position: 0,
              source_type: 'granola',
              source_id: sourceId,
              source_url: granolaCtx.sourceUrl,
              ingest_trigger: 'granola',
              metadata,
            })
            .select('id')
            .single()

          // Unique constraint → already ingested
          if (taskErr?.code === '23505') continue

          if (taskErr) {
            console.error(`Error creating Granola task "${title}":`, taskErr)
            errors.push(title)
            continue
          }

          createdIds.push(newTask.id)
        }

        if (createdIds.length > 0) {
          await updateIngestStatus(supabase, team_id, event_id, 'processed', createdIds[0])
          return { status: 'processed', taskId: createdIds[0] }
        }
        // All deduped or failed
        await updateIngestStatus(supabase, team_id, event_id, 'ignored', undefined, 'granola_all_deduped')
        return { status: 'ignored', reason: 'granola_all_deduped' }
      }

      // Fallback: metadata detection missed — try to parse Granola tasks from text.
      // NOT gated on isGranolaNotification: we don't know exactly how Slack
      // formats event.text, so we try parseGranolaFromText on every DM.
      // It only succeeds when both a notes.granola.ai URL and bullet points exist.
      const parsedGranola = parseGranolaFromText(messageText)

      if (parsedGranola && parsedGranola.tasks.length > 0) {
        console.log(`[DM] Granola text fallback: parsed ${parsedGranola.tasks.length} tasks from message text`)
        const createdIds: string[] = []

        for (const pTask of parsedGranola.tasks) {
          const title = pTask.title.trim()
          const description = `Source: ${parsedGranola.sourceUrl}`

          const titleHash = simpleHash(title)
          const sourceId = `granola:${parsedGranola.sourceUrl}:${titleHash}`

          const metadata = {
            source: {
              type: 'granola' as const,
              granola_url: parsedGranola.sourceUrl,
              slack_team_id: team_id,
              slack_channel_id: event.channel,
              slack_message_ts: event.ts,
            },
            raw: { slack_text: messageText },
          }

          const { data: newTask, error: taskErr } = await supabase
            .from('tasks')
            .insert({
              title,
              description,
              status: 'active',
              user_id,
              position: 0,
              source_type: 'granola',
              source_id: sourceId,
              source_url: parsedGranola.sourceUrl,
              ingest_trigger: 'granola',
              metadata,
            })
            .select('id')
            .single()

          if (taskErr?.code === '23505') continue
          if (taskErr) {
            console.error(`Error creating Granola task (text fallback) "${title}":`, taskErr)
            continue
          }

          createdIds.push(newTask.id)
        }

        if (createdIds.length > 0) {
          await updateIngestStatus(supabase, team_id, event_id, 'processed', createdIds[0])
          return { status: 'processed', taskId: createdIds[0] }
        }
        await updateIngestStatus(supabase, team_id, event_id, 'ignored', undefined, 'granola_text_all_deduped')
        return { status: 'ignored', reason: 'granola_text_all_deduped' }
      }

      // Safety net: if text has a Granola URL but no parseable bullets,
      // still block the regular DM path to prevent garbage LLM-shaped tasks.
      if (hasGranolaUrl(messageText)) {
        console.log('[DM] Granola URL detected but no bullets parsed — blocking regular DM path')
        await updateIngestStatus(supabase, team_id, event_id, 'ignored', undefined, 'granola_notification')
        return { status: 'ignored', reason: 'granola_notification' }
      }

      // ── Regular DM path: LLM shaping ──

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

      const dmSourceUrl = dmPermalink || ''

      // Enforce source link in description
      if (dmSourceUrl && !dmDescription.includes(dmSourceUrl)) {
        dmDescription = dmDescription
          ? `${dmDescription}\n\nSource: ${dmSourceUrl}`
          : `Source: ${dmSourceUrl}`
      }

      // Source ID for deduplication
      const sourceId = `${team_id}:${event.channel}:${event.ts}`

      const dmMetadata = {
        source: {
          type: 'slack' as const,
          subtype: 'dm' as const,
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
        raw: { slack_text: messageText },
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
          source_url: dmSourceUrl,
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
 * Simple deterministic string hash for deduplication source IDs.
 * Not cryptographic — just needs to be stable and collision-resistant enough
 * to distinguish multiple tasks from the same Granola meeting.
 */
export function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash).toString(36)
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
