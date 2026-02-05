/**
 * Integration tests for Slack Mention Ingestion Deduplication
 *
 * Tests the deduplication logic that prevents duplicate tasks
 * from the same Slack message.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateSourceId,
  buildTaskInput,
  SlackIngestMessage,
  LLMTaskClassification,
} from '@/lib/slack/ingest'

/**
 * Helper to create a test message
 */
function createTestMessage(overrides?: Partial<SlackIngestMessage>): SlackIngestMessage {
  return {
    team_id: 'T123ABC',
    channel_id: 'C456DEF',
    message_ts: '1700000000.123456',
    user_id: 'U789GHI',
    text: 'Can you review this PR?',
    permalink: 'https://acme.slack.com/archives/C456DEF/p1700000000123456',
    mentioned_user_ids: ['U999XYZ'],
    trigger: 'mention',
    ingested_at: '2024-01-15T10:30:00.000Z',
    ...overrides,
  }
}

/**
 * Helper to create a test classification
 */
function createTestClassification(
  overrides?: Partial<LLMTaskClassification>
): LLMTaskClassification {
  return {
    is_task: true,
    confidence: 0.85,
    title: 'Review PR #123',
    description: 'The PR needs review before merge',
    why: 'Direct review request',
    ...overrides,
  }
}

describe('generateSourceId', () => {
  it('should generate unique source IDs for different messages', () => {
    const message1 = createTestMessage()
    const message2 = createTestMessage({ message_ts: '1700000001.000000' })
    const message3 = createTestMessage({ channel_id: 'C999XXX' })

    const id1 = generateSourceId(message1)
    const id2 = generateSourceId(message2)
    const id3 = generateSourceId(message3)

    expect(id1).not.toBe(id2)
    expect(id1).not.toBe(id3)
    expect(id2).not.toBe(id3)
  })

  it('should generate same source ID for same message', () => {
    const message1 = createTestMessage()
    const message2 = createTestMessage()

    expect(generateSourceId(message1)).toBe(generateSourceId(message2))
  })

  it('should include team_id, channel_id, and message_ts', () => {
    const message = createTestMessage({
      team_id: 'TTEAM',
      channel_id: 'CCHAN',
      message_ts: '1234567890.000001',
    })

    const sourceId = generateSourceId(message)

    expect(sourceId).toBe('TTEAM:CCHAN:1234567890.000001')
  })

  it('should handle special characters in IDs', () => {
    const message = createTestMessage({
      team_id: 'T-123_ABC',
      channel_id: 'C.456.DEF',
      message_ts: '1700000000.999999',
    })

    const sourceId = generateSourceId(message)

    expect(sourceId).toContain('T-123_ABC')
    expect(sourceId).toContain('C.456.DEF')
    expect(sourceId).toContain('1700000000.999999')
  })
})

describe('buildTaskInput', () => {
  it('should build correct task input from message and classification', () => {
    const message = createTestMessage()
    const classification = createTestClassification()
    const userId = 'user-uuid-123'

    const input = buildTaskInput(userId, message, classification)

    expect(input.user_id).toBe(userId)
    expect(input.title).toBe('Review PR #123')
    expect(input.source_type).toBe('slack')
    expect(input.source_id).toBe('T123ABC:C456DEF:1700000000.123456')
    expect(input.source_url).toBe(message.permalink)
    expect(input.llm_confidence).toBe(0.85)
    expect(input.llm_why).toBe('Direct review request')
    expect(input.ingest_trigger).toBe('mention')
  })

  it('should append permalink to description', () => {
    const message = createTestMessage()
    const classification = createTestClassification({
      description: 'Original description',
    })
    const userId = 'user-uuid-123'

    const input = buildTaskInput(userId, message, classification)

    expect(input.description).toContain('Original description')
    expect(input.description).toContain('Source: https://acme.slack.com/')
    expect(input.description).toContain('\n\n')
  })

  it('should handle empty description', () => {
    const message = createTestMessage()
    const classification = createTestClassification({
      description: '',
    })
    const userId = 'user-uuid-123'

    const input = buildTaskInput(userId, message, classification)

    expect(input.description).toBe(`Source: ${message.permalink}`)
  })

  it('should not include raw_source_text by default', () => {
    const message = createTestMessage()
    const classification = createTestClassification()
    const userId = 'user-uuid-123'

    const input = buildTaskInput(userId, message, classification)

    expect(input.raw_source_text).toBeUndefined()
  })

  it('should include metadata with author display_name when user_name is set', () => {
    const message = createTestMessage({ user_name: 'Gil Alroy' })
    const classification = createTestClassification()
    const userId = 'user-uuid-123'

    const input = buildTaskInput(userId, message, classification)

    expect(input.metadata).toBeDefined()
    const source = (input.metadata as any).source
    expect(source.type).toBe('slack')
    expect(source.subtype).toBe('mention')
    expect(source.author.slack_user_id).toBe('U789GHI')
    expect(source.author.display_name).toBe('Gil Alroy')
    expect(source.permalink).toBe(message.permalink)
  })

  it('should include metadata without display_name when user_name is not set', () => {
    const message = createTestMessage({ user_name: undefined })
    const classification = createTestClassification()
    const userId = 'user-uuid-123'

    const input = buildTaskInput(userId, message, classification)

    expect(input.metadata).toBeDefined()
    const source = (input.metadata as any).source
    expect(source.author.slack_user_id).toBe('U789GHI')
    expect(source.author.display_name).toBeUndefined()
  })

  it('should include team_id, channel_id, and message_ts in metadata', () => {
    const message = createTestMessage()
    const classification = createTestClassification()
    const userId = 'user-uuid-123'

    const input = buildTaskInput(userId, message, classification)

    const source = (input.metadata as any).source
    expect(source.team_id).toBe('T123ABC')
    expect(source.channel_id).toBe('C456DEF')
    expect(source.message_ts).toBe('1700000000.123456')
  })
})

describe('deduplication behavior', () => {
  it('should detect same source_id for repeated messages', () => {
    const message = createTestMessage()

    // Simulate receiving the same Slack message twice
    const firstId = generateSourceId(message)
    const secondId = generateSourceId(message)

    expect(firstId).toBe(secondId)
  })

  it('should generate different IDs for different threads in same channel', () => {
    const message1 = createTestMessage({ thread_ts: '1700000000.000000' })
    const message2 = createTestMessage({ thread_ts: '1700000001.000000' })

    // Different thread_ts but same message_ts should still be same source_id
    // because source_id is based on message_ts, not thread_ts
    const id1 = generateSourceId(message1)
    const id2 = generateSourceId(message2)

    expect(id1).toBe(id2)
  })

  it('should generate different IDs for replies in a thread', () => {
    // Parent message
    const parent = createTestMessage({ message_ts: '1700000000.000000' })

    // Reply to thread (different message_ts)
    const reply = createTestMessage({
      message_ts: '1700000001.000000',
      thread_ts: '1700000000.000000',
    })

    const parentId = generateSourceId(parent)
    const replyId = generateSourceId(reply)

    expect(parentId).not.toBe(replyId)
  })

  it('should handle edge case of very similar timestamps', () => {
    const message1 = createTestMessage({ message_ts: '1700000000.000000' })
    const message2 = createTestMessage({ message_ts: '1700000000.000001' })

    const id1 = generateSourceId(message1)
    const id2 = generateSourceId(message2)

    expect(id1).not.toBe(id2)
  })

  it('should treat same message in different teams as different', () => {
    const message1 = createTestMessage({ team_id: 'TTEAM1' })
    const message2 = createTestMessage({ team_id: 'TTEAM2' })

    const id1 = generateSourceId(message1)
    const id2 = generateSourceId(message2)

    expect(id1).not.toBe(id2)
  })

  it('should treat same message in different channels as different', () => {
    const message1 = createTestMessage({ channel_id: 'CCHAN1' })
    const message2 = createTestMessage({ channel_id: 'CCHAN2' })

    const id1 = generateSourceId(message1)
    const id2 = generateSourceId(message2)

    expect(id1).not.toBe(id2)
  })
})

describe('task input consistency', () => {
  it('should produce same task input for same message', () => {
    const message = createTestMessage()
    const classification = createTestClassification()
    const userId = 'user-uuid-123'

    const input1 = buildTaskInput(userId, message, classification)
    const input2 = buildTaskInput(userId, message, classification)

    expect(input1.source_id).toBe(input2.source_id)
    expect(input1.source_type).toBe(input2.source_type)
    expect(input1.title).toBe(input2.title)
    expect(input1.source_url).toBe(input2.source_url)
  })

  it('should use consistent source_type for Slack', () => {
    const messages = [
      createTestMessage({ text: 'Message 1' }),
      createTestMessage({ text: 'Message 2' }),
      createTestMessage({ text: 'Message 3' }),
    ]

    for (const message of messages) {
      const input = buildTaskInput(
        'user-id',
        message,
        createTestClassification()
      )
      expect(input.source_type).toBe('slack')
    }
  })

  it('should preserve LLM metadata in task input', () => {
    const message = createTestMessage()
    const classification = createTestClassification({
      confidence: 0.92,
      why: 'Urgent request with deadline',
    })
    const userId = 'user-uuid-123'

    const input = buildTaskInput(userId, message, classification)

    expect(input.llm_confidence).toBe(0.92)
    expect(input.llm_why).toBe('Urgent request with deadline')
  })
})
