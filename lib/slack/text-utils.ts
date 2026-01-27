/**
 * Slack Text Utilities
 *
 * Functions for normalizing Slack message text for clean display in Knots.
 * These are render-time transformations that don't modify stored data.
 */

/**
 * User display name map for resolving Slack user IDs to names
 */
export type SlackUserMap = Map<string, string> | Record<string, string>

/**
 * Normalize Slack text by removing/replacing Slack-specific tokens
 *
 * Handles:
 * - User mentions: <@U123ABC> → @DisplayName or @user
 * - Channel mentions: <#C123ABC|channel-name> → #channel-name
 * - URL tokens: <http://example.com|label> → label
 * - URL tokens without label: <http://example.com> → http://example.com
 * - Special tokens: <!here>, <!channel>, <!everyone> → @here, @channel, @everyone
 * - Collapse multiple whitespace
 *
 * @param text - Raw Slack message text
 * @param userMap - Optional map of Slack user IDs to display names
 * @returns Normalized text suitable for display
 */
export function normalizeSlackText(
  text: string,
  userMap?: SlackUserMap
): string {
  if (!text) return ''

  let normalized = text

  // Replace user mentions <@U123ABC> or <@U123ABC|name>
  normalized = normalized.replace(/<@([A-Z0-9]+)(?:\|([^>]+))?>/gi, (_, userId, displayName) => {
    if (displayName) {
      return `@${displayName}`
    }
    if (userMap) {
      const name = userMap instanceof Map ? userMap.get(userId) : userMap[userId]
      if (name) {
        return `@${name}`
      }
    }
    return '@user'
  })

  // Replace channel mentions <#C123ABC|channel-name>
  normalized = normalized.replace(/<#[A-Z0-9]+\|([^>]+)>/gi, '#$1')

  // Replace channel mentions without name <#C123ABC>
  normalized = normalized.replace(/<#[A-Z0-9]+>/gi, '#channel')

  // Replace special mentions
  normalized = normalized.replace(/<!here>/gi, '@here')
  normalized = normalized.replace(/<!channel>/gi, '@channel')
  normalized = normalized.replace(/<!everyone>/gi, '@everyone')

  // Replace URL tokens <http://url|label> → label
  normalized = normalized.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/gi, '$2')

  // Replace URL tokens without label <http://url> → url
  normalized = normalized.replace(/<(https?:\/\/[^>]+)>/gi, '$1')

  // Replace mailto tokens <mailto:email|label> → label
  normalized = normalized.replace(/<mailto:[^|>]+\|([^>]+)>/gi, '$1')

  // Replace mailto tokens without label <mailto:email> → email
  normalized = normalized.replace(/<mailto:([^>]+)>/gi, '$1')

  // Collapse multiple whitespace into single space
  normalized = normalized.replace(/\s+/g, ' ')

  // Trim
  normalized = normalized.trim()

  return normalized
}

/**
 * Derive a clean, scannable title from a Slack message
 *
 * Rules:
 * 1. Normalize Slack tokens first
 * 2. Use first sentence if available (up to maxLength)
 * 3. If text is too short, numeric-only, or empty after normalization, use fallback
 * 4. Truncate with ellipsis if needed
 *
 * @param text - Raw Slack message text
 * @param maxLength - Maximum title length (default 120)
 * @param userMap - Optional map for resolving user mentions
 * @returns Clean title string
 */
export function deriveTitleFromSlackMessage(
  text: string,
  maxLength = 120,
  userMap?: SlackUserMap
): string {
  const fallback = 'Slack message'

  if (!text) return fallback

  // Normalize first
  const normalized = normalizeSlackText(text, userMap)

  // Check for empty or whitespace-only
  if (!normalized || normalized.trim() === '') {
    return fallback
  }

  // Check for numeric-only or very short text (likely not meaningful)
  const trimmed = normalized.trim()
  if (trimmed.length < 3 || /^[\d\s.,!?]+$/.test(trimmed)) {
    return fallback
  }

  // Check if result is only placeholder text (e.g., "@user" from a mention-only message)
  if (/^@(user|channel|here|everyone)$/i.test(trimmed)) {
    return fallback
  }

  // Try to extract first sentence
  // Match up to first sentence-ending punctuation followed by space or end
  const sentenceMatch = trimmed.match(/^(.+?[.!?])(?:\s|$)/)
  let title = sentenceMatch ? sentenceMatch[1] : trimmed

  // Truncate if needed
  if (title.length > maxLength) {
    // Try to break at word boundary
    const truncated = title.substring(0, maxLength - 3)
    const lastSpace = truncated.lastIndexOf(' ')
    if (lastSpace > maxLength * 0.5) {
      title = truncated.substring(0, lastSpace) + '...'
    } else {
      title = truncated + '...'
    }
  }

  return title
}

/**
 * Pattern to detect legacy Slack source block in description
 * Matches: "---\nFrom: ... | Source: Slack DM/mention | Link: ..."
 */
const LEGACY_SOURCE_PATTERN = /\n?---\n(?:From: [^|]+\s*\|\s*)?Source: Slack (DM|mention)(?:\s*\|\s*Link: ([^\s\n]+))?/i

/**
 * Strip the legacy Slack source block from a task description
 *
 * Legacy format embedded at end of description:
 * ---
 * From: Name | Source: Slack DM | Link: https://...
 *
 * @param description - Task description that may contain legacy block
 * @returns Description with source block removed
 */
export function stripSlackSourceBlock(description: string): string {
  if (!description) return ''
  return description.replace(LEGACY_SOURCE_PATTERN, '').trim()
}

/**
 * Result of detecting Slack origin in a task
 */
export interface SlackTaskDetection {
  isSlack: boolean
  subtype?: 'dm' | 'mention'
  permalink?: string
  senderName?: string
}

/**
 * Detect if a task originated from Slack based on description pattern
 *
 * Used for legacy tasks that don't have metadata field.
 * Extracts source type and permalink if available.
 *
 * @param description - Task description to analyze
 * @returns Detection result with extracted metadata
 */
export function detectSlackTask(description: string): SlackTaskDetection {
  if (!description) {
    return { isSlack: false }
  }

  const match = description.match(LEGACY_SOURCE_PATTERN)
  if (!match) {
    return { isSlack: false }
  }

  const subtype = match[1].toLowerCase() as 'dm' | 'mention'
  const permalink = match[2] || undefined

  // Try to extract sender name from "From: Name |" pattern
  const senderMatch = description.match(/---\nFrom: ([^|]+?)\s*\|/)
  const senderName = senderMatch ? senderMatch[1].trim() : undefined

  return {
    isSlack: true,
    subtype,
    permalink,
    senderName,
  }
}

/**
 * Truncate text for list view display with ellipsis
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with ellipsis if needed
 */
export function truncateForListView(text: string, maxLength = 100): string {
  if (!text || text.length <= maxLength) {
    return text || ''
  }

  const truncated = text.substring(0, maxLength - 3)
  const lastSpace = truncated.lastIndexOf(' ')

  // Break at word boundary if reasonable
  if (lastSpace > maxLength * 0.6) {
    return truncated.substring(0, lastSpace) + '...'
  }

  return truncated + '...'
}

/**
 * Prepare task text for display in the list view
 *
 * Combines normalization, legacy block stripping, and truncation.
 *
 * @param title - Task title
 * @param description - Task description
 * @param userMap - Optional user map for mention resolution
 * @returns Object with cleaned title and description
 */
export function prepareTaskForListView(
  title: string,
  description: string,
  userMap?: SlackUserMap
): { title: string; description: string } {
  // Normalize title
  const cleanTitle = normalizeSlackText(title, userMap)

  // For description: strip legacy source block FIRST (before normalization
  // destroys the newline pattern), then normalize, then truncate
  let cleanDescription = stripSlackSourceBlock(description)
  cleanDescription = normalizeSlackText(cleanDescription, userMap)
  cleanDescription = truncateForListView(cleanDescription)

  return {
    title: cleanTitle || title,
    description: cleanDescription,
  }
}

/**
 * Prepare description for the edit form
 *
 * Removes legacy Slack source block but keeps full text (no truncation).
 *
 * @param description - Task description
 * @returns Cleaned description for editing
 */
export function prepareDescriptionForEdit(description: string): string {
  if (!description) return ''

  // Strip legacy source block but keep everything else
  return stripSlackSourceBlock(description)
}
