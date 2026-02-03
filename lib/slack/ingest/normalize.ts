/**
 * Slack Payload Normalization
 *
 * Transforms raw Slack event payloads into a consistent SlackIngestMessage
 * format used by the heuristics and LLM pipeline.
 */

import { SlackIngestMessage } from './types'

/**
 * Raw Slack message event structure
 */
interface SlackRawMessageEvent {
  type: 'message'
  subtype?: string
  channel: string
  channel_type?: string
  user?: string
  text?: string
  ts: string
  thread_ts?: string
  bot_id?: string
  team?: string
}

/**
 * Raw Slack event callback payload
 */
interface SlackRawEventPayload {
  type: 'event_callback'
  token: string
  team_id: string
  api_app_id: string
  event: SlackRawMessageEvent
  event_id: string
  event_time: number
  authorizations?: Array<{
    user_id: string
  }>
}

/**
 * Extract all mentioned user IDs from Slack message text
 * Matches patterns like <@U123ABC>
 */
export function extractMentionedUserIds(text: string): string[] {
  const matches = text.match(/<@([A-Z0-9]+)>/gi) || []
  return [...new Set(matches.map((m) => m.slice(2, -1)))]
}

/**
 * Normalize options
 */
interface NormalizeOptions {
  /** Slack user ID of the current user being checked */
  currentSlackUserId: string
  /** Pre-fetched permalink (optional, can be fetched later) */
  permalink?: string
  /** Channel name if available */
  channelName?: string
  /** Author display name if available */
  userName?: string
}

/**
 * Normalize a raw Slack event payload into SlackIngestMessage
 *
 * @param payload - Raw Slack event_callback payload
 * @param options - Additional options for normalization
 * @returns Normalized message or null if invalid
 */
export function normalizeSlackPayload(
  payload: SlackRawEventPayload,
  options: NormalizeOptions
): SlackIngestMessage | null {
  const { team_id, event } = payload
  const { currentSlackUserId, permalink, channelName, userName } = options

  // Basic validation
  if (!event || event.type !== 'message') {
    return null
  }

  // Skip bot messages
  if (event.bot_id) {
    return null
  }

  // Skip message subtypes (edits, deletes, joins, etc.)
  if (event.subtype && event.subtype !== '') {
    return null
  }

  // Skip empty messages
  if (!event.text || event.text.trim() === '') {
    return null
  }

  // Extract mentioned user IDs
  const mentionedUserIds = extractMentionedUserIds(event.text)

  // Verify current user is mentioned (this is mention-only ingestion)
  if (!mentionedUserIds.includes(currentSlackUserId)) {
    return null
  }

  // Build normalized message
  const normalized: SlackIngestMessage = {
    team_id,
    channel_id: event.channel,
    message_ts: event.ts,
    user_id: event.user || 'unknown',
    text: event.text,
    permalink: permalink || '', // Will be fetched if empty
    mentioned_user_ids: mentionedUserIds,
    trigger: 'mention',
    ingested_at: new Date().toISOString(),
  }

  // Add optional fields
  if (channelName) {
    normalized.channel_name = channelName
  }

  if (userName) {
    normalized.user_name = userName
  }

  if (event.thread_ts) {
    normalized.thread_ts = event.thread_ts
  }

  return normalized
}

/**
 * Generate a unique source ID for deduplication
 */
export function generateSourceId(message: SlackIngestMessage): string {
  return `${message.team_id}:${message.channel_id}:${message.message_ts}`
}

/**
 * Validate that a normalized message has all required fields
 */
export function isValidForProcessing(message: SlackIngestMessage): boolean {
  return !!(
    message.team_id &&
    message.channel_id &&
    message.message_ts &&
    message.text &&
    message.permalink &&
    message.mentioned_user_ids.length > 0
  )
}
