/**
 * Forwarded Message Detection & Content Extraction
 *
 * Detects when a user forwards/shares a Slack message to the Knots bot DM.
 * Forwarding implies explicit user intent, so forwarded messages are always
 * treated as tasks (no heuristic or LLM gating).
 *
 * Detection uses multiple payload cues because Slack represents forwards
 * in several different shapes depending on the client and method used.
 */

/**
 * Slack attachment structure (subset of fields relevant to forwarded messages)
 */
interface SlackAttachment {
  from_url?: string
  original_url?: string
  fallback?: string
  text?: string
  pretext?: string
  author_name?: string
  author_id?: string
  author_link?: string
  channel_id?: string
  channel_name?: string
  ts?: string
  message_blocks?: unknown[]
  is_msg_unfurl?: boolean
  is_share?: boolean
  footer?: string
  id?: number
  [key: string]: unknown
}

/**
 * Slack block element (subset relevant to shared messages)
 */
interface SlackBlock {
  type: string
  block_id?: string
  elements?: SlackBlockElement[]
  [key: string]: unknown
}

interface SlackBlockElement {
  type: string
  elements?: SlackRichTextElement[]
  [key: string]: unknown
}

interface SlackRichTextElement {
  type: string
  text?: string
  url?: string
  user_id?: string
  channel_id?: string
  [key: string]: unknown
}

/**
 * Extended Slack message event with fields present on forwarded messages
 */
export interface SlackMessageEventExtended {
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
  blocks?: SlackBlock[]
  files?: unknown[]
  // Present on some forwarded/shared messages
  root?: {
    text?: string
    user?: string
    ts?: string
    [key: string]: unknown
  }
  // Present on some forwarded/shared messages
  message?: {
    text?: string
    user?: string
    ts?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Cues that triggered forwarded detection, for logging
 */
export interface ForwardedDetectionCues {
  has_attachment_share: boolean
  has_attachment_msg_unfurl: boolean
  has_attachment_from_url: boolean
  has_subtype_share: boolean
  has_rich_text_with_broadcast: boolean
  has_root_or_nested_message: boolean
}

/**
 * Result of forwarded message detection
 */
export interface ForwardedDetectionResult {
  isForwarded: boolean
  cues: ForwardedDetectionCues
  /** Original message permalink extracted from the forwarded payload */
  originalPermalink?: string
  /** Original message text extracted from the forwarded payload */
  originalText?: string
  /** Original message author name */
  originalAuthorName?: string
  /** Original message author ID */
  originalAuthorId?: string
  /** Original channel ID (for dedupe source_id) */
  originalChannelId?: string
  /** Original message timestamp (for dedupe source_id) */
  originalTs?: string
}

/**
 * Detect whether a Slack message event is a forwarded/shared message.
 *
 * Uses multiple payload cues. If uncertain in a bot DM context, prefers
 * treating it as forwarded to avoid missing tasks.
 *
 * @param event - The Slack message event (with extended fields)
 * @returns Detection result with cues and extracted metadata
 */
export function isForwardedToBot(event: SlackMessageEventExtended): ForwardedDetectionResult {
  const cues: ForwardedDetectionCues = {
    has_attachment_share: false,
    has_attachment_msg_unfurl: false,
    has_attachment_from_url: false,
    has_subtype_share: false,
    has_rich_text_with_broadcast: false,
    has_root_or_nested_message: false,
  }

  let originalPermalink: string | undefined
  let originalText: string | undefined
  let originalAuthorName: string | undefined
  let originalAuthorId: string | undefined
  let originalChannelId: string | undefined
  let originalTs: string | undefined

  // --- Cue 1: subtype indicates sharing ---
  // Slack may set subtype to "bot_message" or other values for shared content.
  // Known share-related subtypes:
  const shareSubtypes = ['bot_message', 'me_message', 'file_share']
  if (event.subtype && shareSubtypes.includes(event.subtype)) {
    // Only flag this if there are also attachments (to distinguish from actual bot messages)
    if (event.attachments && event.attachments.length > 0) {
      cues.has_subtype_share = true
    }
  }

  // --- Cue 2: Attachments with share indicators ---
  if (event.attachments && event.attachments.length > 0) {
    for (const att of event.attachments) {
      // Explicit share flag
      if (att.is_share === true) {
        cues.has_attachment_share = true
        extractFromAttachment(att)
      }

      // Message unfurl flag (Slack unfurls shared messages)
      if (att.is_msg_unfurl === true) {
        cues.has_attachment_msg_unfurl = true
        extractFromAttachment(att)
      }

      // from_url pointing to a Slack message (slack.com/archives/...)
      if (att.from_url && isSlackMessageUrl(att.from_url)) {
        cues.has_attachment_from_url = true
        if (!originalPermalink) {
          originalPermalink = att.from_url
        }
        extractFromAttachment(att)
      }

      // original_url pointing to a Slack message
      if (att.original_url && isSlackMessageUrl(att.original_url)) {
        cues.has_attachment_from_url = true
        if (!originalPermalink) {
          originalPermalink = att.original_url
        }
        extractFromAttachment(att)
      }
    }
  }

  // --- Cue 3: Blocks containing rich_text with broadcast/share patterns ---
  if (event.blocks && event.blocks.length > 0) {
    for (const block of event.blocks) {
      if (block.type === 'rich_text' && block.elements) {
        for (const section of block.elements) {
          if (section.type === 'rich_text_preformatted' || section.type === 'rich_text_quote') {
            // Quoted content often indicates a forwarded message
            cues.has_rich_text_with_broadcast = true
            if (section.elements) {
              for (const el of section.elements) {
                if (el.type === 'text' && el.text && !originalText) {
                  originalText = el.text
                }
              }
            }
          }
        }
      }
    }
  }

  // --- Cue 4: Nested message or root reference ---
  if (event.root && event.root.text) {
    cues.has_root_or_nested_message = true
    if (!originalText) {
      originalText = event.root.text
    }
    if (event.root.user && !originalAuthorId) {
      originalAuthorId = event.root.user
    }
    if (event.root.ts && !originalTs) {
      originalTs = event.root.ts
    }
  }

  if (event.message && typeof event.message === 'object' && event.message.text) {
    cues.has_root_or_nested_message = true
    if (!originalText) {
      originalText = event.message.text
    }
    if (event.message.user && !originalAuthorId) {
      originalAuthorId = event.message.user
    }
    if (event.message.ts && !originalTs) {
      originalTs = event.message.ts
    }
  }

  // Determine if forwarded based on cues
  const isForwarded =
    cues.has_attachment_share ||
    cues.has_attachment_msg_unfurl ||
    cues.has_attachment_from_url ||
    (cues.has_subtype_share && (cues.has_attachment_from_url || cues.has_attachment_msg_unfurl || cues.has_attachment_share)) ||
    cues.has_root_or_nested_message

  return {
    isForwarded,
    cues,
    originalPermalink,
    originalText,
    originalAuthorName,
    originalAuthorId,
    originalChannelId,
    originalTs,
  }

  // --- Helper to extract metadata from an attachment ---
  function extractFromAttachment(att: SlackAttachment) {
    if (att.text && !originalText) {
      originalText = att.text
    }
    if (att.fallback && !originalText) {
      originalText = att.fallback
    }
    if (att.author_name && !originalAuthorName) {
      originalAuthorName = att.author_name
    }
    if (att.author_id && !originalAuthorId) {
      originalAuthorId = att.author_id
    }
    if (att.channel_id && !originalChannelId) {
      originalChannelId = att.channel_id
    }
    if (att.ts && !originalTs) {
      originalTs = att.ts
    }
    if (att.from_url && isSlackMessageUrl(att.from_url) && !originalPermalink) {
      originalPermalink = att.from_url
    }
  }
}

/**
 * Check if a URL is a Slack message permalink
 */
function isSlackMessageUrl(url: string): boolean {
  return /^https?:\/\/[^/]*\.?slack\.com\/archives\//.test(url)
}

/**
 * Extract the best available text content from a forwarded message.
 *
 * Priority:
 * 1. Original message text from attachments/nested message
 * 2. Wrapper text from the DM event itself
 * 3. Fallback
 *
 * @param event - The Slack message event
 * @param detection - Result from isForwardedToBot()
 * @returns The best text content available
 */
export function extractForwardedContent(
  event: SlackMessageEventExtended,
  detection: ForwardedDetectionResult
): { text: string; authorName?: string; authorId?: string } {
  // Priority 1: text extracted during detection (from attachments/nested message)
  if (detection.originalText && detection.originalText.trim()) {
    return {
      text: detection.originalText.trim(),
      authorName: detection.originalAuthorName,
      authorId: detection.originalAuthorId,
    }
  }

  // Priority 2: attachment text or fallback
  if (event.attachments) {
    for (const att of event.attachments as SlackAttachment[]) {
      if (att.text && att.text.trim()) {
        return {
          text: att.text.trim(),
          authorName: att.author_name,
          authorId: att.author_id,
        }
      }
      if (att.fallback && att.fallback.trim()) {
        return {
          text: att.fallback.trim(),
          authorName: att.author_name,
          authorId: att.author_id,
        }
      }
    }
  }

  // Priority 3: event text itself (the wrapper message the user typed)
  if (event.text && event.text.trim()) {
    return { text: event.text.trim() }
  }

  // Fallback
  return { text: 'Forwarded Slack message' }
}

/**
 * Derive a dedupe source_id for a forwarded message.
 *
 * Prefers the original message coordinates when available (so re-forwarding
 * the same message dedupes correctly). Falls back to the DM message coordinates.
 *
 * @param teamId - Slack team ID
 * @param event - The DM message event
 * @param detection - Result from isForwardedToBot()
 * @returns source_id string in the format team:channel:ts
 */
export function generateForwardedSourceId(
  teamId: string,
  event: SlackMessageEventExtended,
  detection: ForwardedDetectionResult
): string {
  // Prefer original message coordinates for dedupe
  if (detection.originalChannelId && detection.originalTs) {
    return `${teamId}:${detection.originalChannelId}:${detection.originalTs}`
  }

  // Try to parse channel + ts from the original permalink
  if (detection.originalPermalink) {
    const parsed = parseSlackPermalink(detection.originalPermalink)
    if (parsed) {
      return `${teamId}:${parsed.channelId}:${parsed.messageTs}`
    }
  }

  // Fallback: use the DM message coordinates
  return `${teamId}:${event.channel}:${event.ts}`
}

/**
 * Parse a Slack permalink to extract channel ID and message timestamp.
 *
 * Format: https://workspace.slack.com/archives/C123ABC/p1700000000000000
 *
 * @param permalink - Slack permalink URL
 * @returns Parsed channel ID and message timestamp, or null
 */
function parseSlackPermalink(permalink: string): { channelId: string; messageTs: string } | null {
  const match = permalink.match(/\/archives\/([A-Z0-9]+)\/p(\d{10})(\d{6})/)
  if (!match) return null
  return {
    channelId: match[1],
    messageTs: `${match[2]}.${match[3]}`,
  }
}
