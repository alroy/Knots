/**
 * Text Utilities
 *
 * Functions for normalizing message text for clean display in Knots.
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
 * Pattern to detect legacy Slack source block in description
 * Matches: "---\nFrom: ... | Source: Slack DM/mention | Link: ..."
 * Note: Uses [\r\n]+ to handle Windows/Unix line endings and multiple blank lines
 */
const LEGACY_SOURCE_PATTERN = /[\r\n]+---[\r\n]+(?:From: [^|]+\s*\|\s*)?Source: Slack (DM|mention)(?:\s*\|\s*Link: ([^\s\r\n]+))?/i

/**
 * Pattern to detect simple source URL appended to description
 * Matches: "\n\nSource: https://..." at end of description
 */
const SOURCE_URL_PATTERN = /[\r\n]+Source:\s*https?:\/\/[^\s]+$/i

/**
 * Strip the Slack source block from a task description
 *
 * Handles two formats:
 * 1. Legacy format: "---\nFrom: Name | Source: Slack DM | Link: https://..."
 * 2. New format: "\n\nSource: https://..."
 *
 * @param description - Task description that may contain source block
 * @returns Description with source block removed
 */
export function stripSlackSourceBlock(description: string): string {
  if (!description) return ''
  // Strip legacy format first, then new format
  return description
    .replace(LEGACY_SOURCE_PATTERN, '')
    .replace(SOURCE_URL_PATTERN, '')
    .trim()
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

/**
 * Compute word-overlap (Jaccard) similarity between two strings.
 * Returns a value between 0 (no overlap) and 1 (identical word sets).
 * Ignores case and common stop-words for better matching of action-item titles.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
])

export function titleSimilarity(a: string, b: string): number {
  const tokenize = (s: string) => {
    const words = s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w && !STOP_WORDS.has(w))
    return new Set(words)
  }
  const setA = tokenize(a)
  const setB = tokenize(b)
  if (setA.size === 0 && setB.size === 0) return 1
  if (setA.size === 0 || setB.size === 0) return 0
  let intersection = 0
  for (const w of setA) {
    if (setB.has(w)) intersection++
  }
  return intersection / (setA.size + setB.size - intersection)
}
