/**
 * Heuristic Actionability Scoring for Slack Mentions
 *
 * Since all ingested messages include a mention, we need heuristics to detect:
 * - Actionable requests (ownership, deadline, responsibility)
 * - vs. informational routing/visibility mentions
 *
 * The score is computed from weighted signals and determines whether to call the LLM.
 */

import { SlackIngestMessage, INGEST_THRESHOLDS } from './types'

/**
 * Signal weights for actionability scoring
 * Positive = increases score, Negative = decreases score
 */
const SIGNAL_WEIGHTS = {
  // Strong positive signals - direct asks
  DIRECT_ASK: 0.25,
  OWNERSHIP: 0.30,
  STATUS_CHECK: 0.20,
  TIMING: 0.25,
  QUESTION_MARK: 0.10,
  PLEASE: 0.10,

  // Strong negative signals - informational/routing
  FYI: -0.35,
  VISIBILITY: -0.30,
  LOOP_IN: -0.25,
  ANNOUNCEMENT: -0.15,
  EMOJI_HEAVY: -0.15,
} as const

/**
 * Pattern definitions for signal detection
 */
const PATTERNS = {
  // Direct ask patterns
  DIRECT_ASK: /\b(can you|could you|would you|will you|please|need you to|need to|take a look|review|approve|fix|ship|reply|follow up|respond|schedule|send|update|complete|finish|submit|check|verify|confirm|prepare|draft|create|write|build|implement|test|deploy|investigate|look into|dig into)\b/i,

  // Ownership language
  OWNERSHIP: /\b(you own|assigned to you|please handle|can you take|take over|your turn|you're up|up to you|on you|yours to|you're responsible|your responsibility|counting on you|depends on you)\b/i,

  // Status checks
  STATUS_CHECK: /\b(what's the status|any update|where are we on|eta|when can|how's it going|progress on|update on|status of|timeline for|expected date|target date)\b/i,

  // Timing/deadline indicators
  TIMING: /\b(today|tomorrow|eod|end of day|end of week|eow|this week|next week|by monday|by tuesday|by wednesday|by thursday|by friday|asap|urgent|priority|deadline|due|before|by the end)\b/i,

  // FYI/informational patterns
  FYI: /\b(fyi|for your info|for your information|just fyi|quick fyi)\b/i,

  // Visibility/routing patterns
  VISIBILITY: /\b(for visibility|for your awareness|for your records|in case you missed|just sharing|sharing this|wanted to share|keeping you in the loop|keeping you posted|heads up|head's up|just a heads up)\b/i,

  // Loop-in patterns
  LOOP_IN: /\b(looping you in|adding you|cc'ing you|cc-ing|copied you|tagging you|including you|adding to thread|loop in|looping in)\b/i,

  // Announcement patterns (no action verbs, declarative)
  ANNOUNCEMENT: /^(announcing|we've|we have|we are|the team|excited to|happy to share|pleased to announce)/i,
}

/**
 * Detailed scoring result with signal breakdown
 */
export interface ActionabilityResult {
  score: number
  signals: {
    name: string
    weight: number
    matched: boolean
  }[]
  recommendation: 'call_llm' | 'skip_llm'
  requiredConfidence: number | null
}

/**
 * Count approximate emoji usage in text
 */
function countEmojis(text: string): number {
  // Match Slack emoji patterns :emoji_name: and Unicode emojis
  const slackEmojiMatches = text.match(/:[a-z0-9_+-]+:/gi) || []
  // Simple Unicode emoji detection (not comprehensive but catches common ones)
  const unicodeEmojiMatches =
    text.match(
      /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu
    ) || []
  return slackEmojiMatches.length + unicodeEmojiMatches.length
}

/**
 * Check if text is predominantly emoji-based
 */
function isEmojiHeavy(text: string): boolean {
  const emojiCount = countEmojis(text)
  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length

  // If more than 50% emojis relative to words, or mostly emojis
  return emojiCount > 3 && emojiCount >= wordCount * 0.5
}

/**
 * Check if text ends with a question mark
 */
function hasQuestionMark(text: string): boolean {
  return /\?\s*$/.test(text.trim())
}

/**
 * Check if text contains "please" (weak positive signal)
 */
function hasPlease(text: string): boolean {
  return /\bplease\b/i.test(text)
}

/**
 * Compute actionability score for a Slack mention message
 *
 * @param message - Normalized Slack message
 * @returns Scoring result with signals and recommendation
 */
export function computeActionabilityScore(
  message: SlackIngestMessage
): ActionabilityResult {
  const { text } = message
  const signals: ActionabilityResult['signals'] = []

  // Start with neutral score
  let score = 0.5

  // Check positive signals
  const hasDirectAsk = PATTERNS.DIRECT_ASK.test(text)
  signals.push({
    name: 'direct_ask',
    weight: SIGNAL_WEIGHTS.DIRECT_ASK,
    matched: hasDirectAsk,
  })
  if (hasDirectAsk) score += SIGNAL_WEIGHTS.DIRECT_ASK

  const hasOwnership = PATTERNS.OWNERSHIP.test(text)
  signals.push({
    name: 'ownership',
    weight: SIGNAL_WEIGHTS.OWNERSHIP,
    matched: hasOwnership,
  })
  if (hasOwnership) score += SIGNAL_WEIGHTS.OWNERSHIP

  const hasStatusCheck = PATTERNS.STATUS_CHECK.test(text)
  signals.push({
    name: 'status_check',
    weight: SIGNAL_WEIGHTS.STATUS_CHECK,
    matched: hasStatusCheck,
  })
  if (hasStatusCheck) score += SIGNAL_WEIGHTS.STATUS_CHECK

  const hasTiming = PATTERNS.TIMING.test(text)
  signals.push({
    name: 'timing',
    weight: SIGNAL_WEIGHTS.TIMING,
    matched: hasTiming,
  })
  if (hasTiming) score += SIGNAL_WEIGHTS.TIMING

  const questionMark = hasQuestionMark(text)
  signals.push({
    name: 'question_mark',
    weight: SIGNAL_WEIGHTS.QUESTION_MARK,
    matched: questionMark,
  })
  if (questionMark) score += SIGNAL_WEIGHTS.QUESTION_MARK

  const pleaseMentioned = hasPlease(text)
  signals.push({
    name: 'please',
    weight: SIGNAL_WEIGHTS.PLEASE,
    matched: pleaseMentioned,
  })
  if (pleaseMentioned) score += SIGNAL_WEIGHTS.PLEASE

  // Check negative signals
  const hasFyi = PATTERNS.FYI.test(text)
  signals.push({ name: 'fyi', weight: SIGNAL_WEIGHTS.FYI, matched: hasFyi })
  if (hasFyi) score += SIGNAL_WEIGHTS.FYI

  const hasVisibility = PATTERNS.VISIBILITY.test(text)
  signals.push({
    name: 'visibility',
    weight: SIGNAL_WEIGHTS.VISIBILITY,
    matched: hasVisibility,
  })
  if (hasVisibility) score += SIGNAL_WEIGHTS.VISIBILITY

  const hasLoopIn = PATTERNS.LOOP_IN.test(text)
  signals.push({
    name: 'loop_in',
    weight: SIGNAL_WEIGHTS.LOOP_IN,
    matched: hasLoopIn,
  })
  if (hasLoopIn) score += SIGNAL_WEIGHTS.LOOP_IN

  const hasAnnouncement = PATTERNS.ANNOUNCEMENT.test(text)
  signals.push({
    name: 'announcement',
    weight: SIGNAL_WEIGHTS.ANNOUNCEMENT,
    matched: hasAnnouncement,
  })
  if (hasAnnouncement) score += SIGNAL_WEIGHTS.ANNOUNCEMENT

  const emojiHeavy = isEmojiHeavy(text)
  signals.push({
    name: 'emoji_heavy',
    weight: SIGNAL_WEIGHTS.EMOJI_HEAVY,
    matched: emojiHeavy,
  })
  if (emojiHeavy) score += SIGNAL_WEIGHTS.EMOJI_HEAVY

  // Clamp score to 0-1 range
  score = Math.max(0, Math.min(1, score))

  // Determine recommendation based on thresholds
  let recommendation: ActionabilityResult['recommendation']
  let requiredConfidence: number | null

  if (score < INGEST_THRESHOLDS.LOW_ACTIONABILITY) {
    recommendation = 'skip_llm'
    requiredConfidence = null
  } else if (score >= INGEST_THRESHOLDS.HIGH_ACTIONABILITY) {
    recommendation = 'call_llm'
    requiredConfidence = INGEST_THRESHOLDS.HIGH_RANGE_CONFIDENCE
  } else {
    recommendation = 'call_llm'
    requiredConfidence = INGEST_THRESHOLDS.MID_RANGE_CONFIDENCE
  }

  return {
    score,
    signals,
    recommendation,
    requiredConfidence,
  }
}

/**
 * Check if LLM should be called based on actionability score
 */
export function shouldCallLLM(score: number): boolean {
  return score >= INGEST_THRESHOLDS.LOW_ACTIONABILITY
}

/**
 * Get required confidence threshold based on actionability score
 */
export function getRequiredConfidence(score: number): number {
  if (score >= INGEST_THRESHOLDS.HIGH_ACTIONABILITY) {
    return INGEST_THRESHOLDS.HIGH_RANGE_CONFIDENCE
  }
  return INGEST_THRESHOLDS.MID_RANGE_CONFIDENCE
}
