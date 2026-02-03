/**
 * Unit tests for LLM JSON Validation
 *
 * Tests the Zod schema validation for LLM classification responses
 * and the fallback mechanism when validation fails.
 */

import { describe, it, expect } from 'vitest'
import { LLMTaskClassificationSchema, SlackIngestMessage } from '@/lib/slack/ingest/types'
import { createFallbackFromMessage } from '@/lib/slack/ingest/classify'

describe('LLMTaskClassificationSchema', () => {
  describe('valid responses', () => {
    it('should accept valid is_task=true response', () => {
      const response = {
        is_task: true,
        confidence: 0.85,
        title: 'Review PR #123',
        description: 'The PR needs review before merge',
        why: 'Direct review request with urgency',
        task_type: 'follow_up',
      }

      const result = LLMTaskClassificationSchema.safeParse(response)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.is_task).toBe(true)
        expect(result.data.confidence).toBe(0.85)
        expect(result.data.title).toBe('Review PR #123')
        expect(result.data.task_type).toBe('follow_up')
      }
    })

    it('should accept valid is_task=false response', () => {
      const response = {
        is_task: false,
        confidence: 0.2,
        title: '',
        description: '',
        why: 'FYI message with no action required',
      }

      const result = LLMTaskClassificationSchema.safeParse(response)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.is_task).toBe(false)
        expect(result.data.confidence).toBe(0.2)
      }
    })

    it('should accept response with optional fields', () => {
      const response = {
        is_task: true,
        confidence: 0.9,
        title: 'Fix bug in login flow',
        description: 'Users are getting logged out randomly',
        why: 'Bug report with clear action',
        task_type: 'bug',
        due_hint: 'by end of day',
        assignees_hint: ['@john', '@jane'],
      }

      const result = LLMTaskClassificationSchema.safeParse(response)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.task_type).toBe('bug')
        expect(result.data.due_hint).toBe('by end of day')
        expect(result.data.assignees_hint).toEqual(['@john', '@jane'])
      }
    })

    it('should accept string assignees_hint', () => {
      const response = {
        is_task: true,
        confidence: 0.8,
        title: 'Deploy to staging',
        description: 'Ready for QA',
        why: 'Deployment request',
        assignees_hint: '@team',
      }

      const result = LLMTaskClassificationSchema.safeParse(response)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.assignees_hint).toBe('@team')
      }
    })

    it('should accept all valid task types', () => {
      const taskTypes = ['follow_up', 'bug', 'decision', 'research', 'admin', 'misc']

      for (const taskType of taskTypes) {
        const response = {
          is_task: true,
          confidence: 0.75,
          title: 'Test task',
          description: 'Test description',
          why: 'Test reason',
          task_type: taskType,
        }

        const result = LLMTaskClassificationSchema.safeParse(response)
        expect(result.success).toBe(true)
      }
    })

    it('should accept confidence at boundaries', () => {
      const responseMin = {
        is_task: false,
        confidence: 0,
        title: '',
        description: '',
        why: 'Very uncertain',
      }

      const responseMax = {
        is_task: true,
        confidence: 1,
        title: 'Very certain task',
        description: 'Absolutely clear action',
        why: 'Crystal clear request',
      }

      expect(LLMTaskClassificationSchema.safeParse(responseMin).success).toBe(true)
      expect(LLMTaskClassificationSchema.safeParse(responseMax).success).toBe(true)
    })
  })

  describe('invalid responses', () => {
    it('should reject missing required fields', () => {
      const response = {
        is_task: true,
        confidence: 0.8,
        // missing title, description, why
      }

      const result = LLMTaskClassificationSchema.safeParse(response)
      expect(result.success).toBe(false)
    })

    it('should reject invalid confidence range (negative)', () => {
      const response = {
        is_task: false,
        confidence: -0.5,
        title: '',
        description: '',
        why: 'Invalid confidence',
      }

      const result = LLMTaskClassificationSchema.safeParse(response)
      expect(result.success).toBe(false)
    })

    it('should reject invalid confidence range (> 1)', () => {
      const response = {
        is_task: true,
        confidence: 1.5,
        title: 'Test',
        description: 'Test',
        why: 'Invalid confidence',
      }

      const result = LLMTaskClassificationSchema.safeParse(response)
      expect(result.success).toBe(false)
    })

    it('should reject invalid task_type', () => {
      const response = {
        is_task: true,
        confidence: 0.8,
        title: 'Test',
        description: 'Test',
        why: 'Test',
        task_type: 'invalid_type',
      }

      const result = LLMTaskClassificationSchema.safeParse(response)
      expect(result.success).toBe(false)
    })

    it('should reject non-boolean is_task', () => {
      const response = {
        is_task: 'yes',
        confidence: 0.8,
        title: 'Test',
        description: 'Test',
        why: 'Test',
      }

      const result = LLMTaskClassificationSchema.safeParse(response)
      expect(result.success).toBe(false)
    })

    it('should reject non-number confidence', () => {
      const response = {
        is_task: true,
        confidence: 'high',
        title: 'Test',
        description: 'Test',
        why: 'Test',
      }

      const result = LLMTaskClassificationSchema.safeParse(response)
      expect(result.success).toBe(false)
    })

    it('should reject invalid JSON structure', () => {
      const invalidInputs = [null, undefined, 'string', 123, [], true]

      for (const input of invalidInputs) {
        const result = LLMTaskClassificationSchema.safeParse(input)
        expect(result.success).toBe(false)
      }
    })
  })

  describe('edge cases', () => {
    it('should handle empty strings', () => {
      const response = {
        is_task: true,
        confidence: 0.5,
        title: '',
        description: '',
        why: '',
      }

      // Schema accepts empty strings - validation of title length is done separately
      const result = LLMTaskClassificationSchema.safeParse(response)
      expect(result.success).toBe(true)
    })

    it('should handle unicode in strings', () => {
      const response = {
        is_task: true,
        confidence: 0.8,
        title: 'レビュー PR #123 🚀',
        description: '日本語の説明文',
        why: 'Multilingual support',
      }

      const result = LLMTaskClassificationSchema.safeParse(response)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.title).toBe('レビュー PR #123 🚀')
      }
    })

    it('should handle very long strings', () => {
      const response = {
        is_task: true,
        confidence: 0.75,
        title: 'A'.repeat(1000),
        description: 'B'.repeat(10000),
        why: 'C'.repeat(500),
      }

      // Schema should accept - length validation is done separately
      const result = LLMTaskClassificationSchema.safeParse(response)
      expect(result.success).toBe(true)
    })
  })
})

describe('createFallbackFromMessage', () => {
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

  it('should create fallback with first 10 words as title', () => {
    const message = createTestMessage(
      'This is a long message with many words that should be truncated for the title'
    )
    const fallback = createFallbackFromMessage(message)

    expect(fallback.title.split(' ').length).toBeLessThanOrEqual(10)
    expect(fallback.description).toBe(message.text)
    expect(fallback.llm_confidence).toBeNull()
    expect(fallback.llm_why).toBe('llm_failed_validation')
  })

  it('should clean up Slack tokens in title', () => {
    const message = createTestMessage(
      '<@U123> please review <https://github.com/pr/123|PR #123>'
    )
    const fallback = createFallbackFromMessage(message)

    expect(fallback.title).not.toContain('<@U123>')
    expect(fallback.title).toContain('@user')
    expect(fallback.title).toContain('PR #123')
  })

  it('should truncate title to 80 characters', () => {
    const message = createTestMessage('word '.repeat(50))
    const fallback = createFallbackFromMessage(message)

    expect(fallback.title.length).toBeLessThanOrEqual(80)
  })

  it('should handle very short messages', () => {
    const message = createTestMessage('hi')
    const fallback = createFallbackFromMessage(message)

    // Should use fallback title for very short text
    expect(fallback.title.length).toBeGreaterThanOrEqual(2)
  })

  it('should preserve full text in description', () => {
    const longText = 'This is a very long message. '.repeat(100)
    const message = createTestMessage(longText)
    const fallback = createFallbackFromMessage(message)

    expect(fallback.description).toBe(longText)
  })

  it('should handle channel mentions', () => {
    const message = createTestMessage('<#C123|general> discussion about <#C456>')
    const fallback = createFallbackFromMessage(message)

    expect(fallback.title).toContain('#general')
  })

  it('should handle URL links', () => {
    const message = createTestMessage('Check out <https://example.com|this link>')
    const fallback = createFallbackFromMessage(message)

    expect(fallback.title).toContain('this link')
    expect(fallback.title).not.toContain('https://')
  })

  it('should handle URLs without labels', () => {
    const message = createTestMessage('Link: <https://example.com/very/long/path>')
    const fallback = createFallbackFromMessage(message)

    expect(fallback.title).toContain('[link]')
  })
})
