/**
 * Unit tests for Slack Mention Actionability Scoring
 *
 * Tests the heuristic scoring system that determines whether
 * a Slack mention should trigger an LLM call.
 */

import { describe, it, expect } from 'vitest'
import {
  computeActionabilityScore,
  shouldCallLLM,
  getRequiredConfidence,
} from '@/lib/slack/ingest/actionability'
import { SlackIngestMessage, INGEST_THRESHOLDS } from '@/lib/slack/ingest/types'

/**
 * Helper to create a test message
 */
function createTestMessage(text: string): SlackIngestMessage {
  return {
    team_id: 'T123',
    channel_id: 'C456',
    message_ts: '1700000000.000000',
    user_id: 'U789',
    text,
    permalink: 'https://test.slack.com/archives/C456/p1700000000000000',
    mentioned_user_ids: ['U999'],
    trigger: 'mention',
    ingested_at: new Date().toISOString(),
  }
}

describe('computeActionabilityScore', () => {
  describe('direct ask mentions - high scores', () => {
    it('should score high for "can you review" patterns', () => {
      const message = createTestMessage('<@U999> can you review this PR?')
      const result = computeActionabilityScore(message)

      expect(result.score).toBeGreaterThanOrEqual(INGEST_THRESHOLDS.HIGH_ACTIONABILITY)
      expect(result.recommendation).toBe('call_llm')
      expect(result.signals.find((s) => s.name === 'direct_ask')?.matched).toBe(true)
      expect(result.signals.find((s) => s.name === 'question_mark')?.matched).toBe(true)
    })

    it('should score high for "please" with action verb', () => {
      const message = createTestMessage('<@U999> please fix the build')
      const result = computeActionabilityScore(message)

      expect(result.score).toBeGreaterThanOrEqual(INGEST_THRESHOLDS.LOW_ACTIONABILITY)
      expect(result.recommendation).toBe('call_llm')
      expect(result.signals.find((s) => s.name === 'direct_ask')?.matched).toBe(true)
      expect(result.signals.find((s) => s.name === 'please')?.matched).toBe(true)
    })

    it('should score high for deadline mentions', () => {
      const message = createTestMessage('<@U999> need this by EOD')
      const result = computeActionabilityScore(message)

      expect(result.score).toBeGreaterThanOrEqual(INGEST_THRESHOLDS.LOW_ACTIONABILITY)
      expect(result.recommendation).toBe('call_llm')
      expect(result.signals.find((s) => s.name === 'timing')?.matched).toBe(true)
    })

    it('should score high for status check questions', () => {
      const message = createTestMessage("<@U999> what's the status on the migration?")
      const result = computeActionabilityScore(message)

      expect(result.score).toBeGreaterThanOrEqual(INGEST_THRESHOLDS.LOW_ACTIONABILITY)
      expect(result.recommendation).toBe('call_llm')
      expect(result.signals.find((s) => s.name === 'status_check')?.matched).toBe(true)
      expect(result.signals.find((s) => s.name === 'question_mark')?.matched).toBe(true)
    })

    it('should score high for ownership language', () => {
      const message = createTestMessage('<@U999> this is assigned to you')
      const result = computeActionabilityScore(message)

      expect(result.score).toBeGreaterThanOrEqual(INGEST_THRESHOLDS.LOW_ACTIONABILITY)
      expect(result.recommendation).toBe('call_llm')
      expect(result.signals.find((s) => s.name === 'ownership')?.matched).toBe(true)
    })

    it('should score very high for combined signals', () => {
      const message = createTestMessage('<@U999> can you please review and approve by tomorrow?')
      const result = computeActionabilityScore(message)

      expect(result.score).toBeGreaterThanOrEqual(0.8)
      expect(result.recommendation).toBe('call_llm')
      expect(result.requiredConfidence).toBe(INGEST_THRESHOLDS.HIGH_RANGE_CONFIDENCE)
    })
  })

  describe('FYI/visibility mentions - low scores', () => {
    it('should score low for "FYI" mentions', () => {
      const message = createTestMessage('<@U999> FYI the deployment is done')
      const result = computeActionabilityScore(message)

      expect(result.score).toBeLessThan(INGEST_THRESHOLDS.HIGH_ACTIONABILITY)
      expect(result.signals.find((s) => s.name === 'fyi')?.matched).toBe(true)
    })

    it('should score low for "for visibility" mentions', () => {
      const message = createTestMessage('<@U999> for visibility - we shipped the feature')
      const result = computeActionabilityScore(message)

      expect(result.score).toBeLessThan(INGEST_THRESHOLDS.HIGH_ACTIONABILITY)
      expect(result.signals.find((s) => s.name === 'visibility')?.matched).toBe(true)
    })

    it('should score low for "looping you in" mentions', () => {
      const message = createTestMessage('<@U999> looping you in on this thread')
      const result = computeActionabilityScore(message)

      expect(result.score).toBeLessThan(INGEST_THRESHOLDS.HIGH_ACTIONABILITY)
      expect(result.signals.find((s) => s.name === 'loop_in')?.matched).toBe(true)
    })

    it('should score low for "heads up" mentions', () => {
      const message = createTestMessage('<@U999> heads up - meeting moved to 3pm')
      const result = computeActionabilityScore(message)

      expect(result.score).toBeLessThan(INGEST_THRESHOLDS.HIGH_ACTIONABILITY)
      expect(result.signals.find((s) => s.name === 'visibility')?.matched).toBe(true)
    })

    it('should score very low for combined negative signals', () => {
      const message = createTestMessage('<@U999> just FYI, looping you in for visibility')
      const result = computeActionabilityScore(message)

      expect(result.score).toBeLessThan(INGEST_THRESHOLDS.LOW_ACTIONABILITY)
      expect(result.recommendation).toBe('skip_llm')
    })
  })

  describe('ambiguous mentions - mid scores', () => {
    it('should score mid-range for plain mention without signals', () => {
      const message = createTestMessage("<@U999> here's the doc you asked about")
      const result = computeActionabilityScore(message)

      expect(result.score).toBeGreaterThanOrEqual(INGEST_THRESHOLDS.LOW_ACTIONABILITY)
      expect(result.score).toBeLessThan(INGEST_THRESHOLDS.HIGH_ACTIONABILITY)
      expect(result.recommendation).toBe('call_llm')
      expect(result.requiredConfidence).toBe(INGEST_THRESHOLDS.MID_RANGE_CONFIDENCE)
    })

    it('should score mid-range for question without action verb', () => {
      const message = createTestMessage('<@U999> thoughts on this approach?')
      const result = computeActionabilityScore(message)

      expect(result.score).toBeGreaterThanOrEqual(INGEST_THRESHOLDS.LOW_ACTIONABILITY)
      expect(result.recommendation).toBe('call_llm')
    })

    it('should balance positive and negative signals', () => {
      // FYI but with action verb
      const message = createTestMessage('<@U999> FYI can you take a look when you have time')
      const result = computeActionabilityScore(message)

      // Should be somewhere in the middle
      expect(result.score).toBeGreaterThan(0.2)
      expect(result.score).toBeLessThan(0.8)
    })
  })

  describe('edge cases', () => {
    it('should handle emoji-heavy messages', () => {
      const message = createTestMessage('<@U999> :tada: :rocket: :sparkles: :100:')
      const result = computeActionabilityScore(message)

      expect(result.signals.find((s) => s.name === 'emoji_heavy')?.matched).toBe(true)
    })

    it('should handle very short messages', () => {
      const message = createTestMessage('<@U999> hi')
      const result = computeActionabilityScore(message)

      // Should still compute a score (neutral baseline)
      expect(result.score).toBeGreaterThanOrEqual(0)
      expect(result.score).toBeLessThanOrEqual(1)
    })

    it('should handle very long messages', () => {
      const longText = '<@U999> ' + 'word '.repeat(500) + 'please review this'
      const message = createTestMessage(longText)
      const result = computeActionabilityScore(message)

      // Should still detect the "please review" signal
      expect(result.signals.find((s) => s.name === 'direct_ask')?.matched).toBe(true)
    })

    it('should clamp score to 0-1 range', () => {
      // All positive signals
      const message = createTestMessage(
        '<@U999> can you please take this over by tomorrow? what\'s the ETA?'
      )
      const result = computeActionabilityScore(message)

      expect(result.score).toBeLessThanOrEqual(1)
      expect(result.score).toBeGreaterThanOrEqual(0)
    })
  })
})

describe('shouldCallLLM', () => {
  it('should return false for low scores', () => {
    expect(shouldCallLLM(0.1)).toBe(false)
    expect(shouldCallLLM(0.2)).toBe(false)
    expect(shouldCallLLM(0.34)).toBe(false)
  })

  it('should return true at threshold', () => {
    expect(shouldCallLLM(INGEST_THRESHOLDS.LOW_ACTIONABILITY)).toBe(true)
  })

  it('should return true for high scores', () => {
    expect(shouldCallLLM(0.5)).toBe(true)
    expect(shouldCallLLM(0.7)).toBe(true)
    expect(shouldCallLLM(1.0)).toBe(true)
  })
})

describe('getRequiredConfidence', () => {
  it('should return high confidence for mid-range scores', () => {
    expect(getRequiredConfidence(0.4)).toBe(INGEST_THRESHOLDS.MID_RANGE_CONFIDENCE)
    expect(getRequiredConfidence(0.5)).toBe(INGEST_THRESHOLDS.MID_RANGE_CONFIDENCE)
    expect(getRequiredConfidence(0.59)).toBe(INGEST_THRESHOLDS.MID_RANGE_CONFIDENCE)
  })

  it('should return lower confidence for high scores', () => {
    expect(getRequiredConfidence(0.6)).toBe(INGEST_THRESHOLDS.HIGH_RANGE_CONFIDENCE)
    expect(getRequiredConfidence(0.8)).toBe(INGEST_THRESHOLDS.HIGH_RANGE_CONFIDENCE)
    expect(getRequiredConfidence(1.0)).toBe(INGEST_THRESHOLDS.HIGH_RANGE_CONFIDENCE)
  })
})
