import { describe, it, expect } from 'vitest'
import {
  shouldCreateTask,
  extractTaskTitle,
  formatTaskDescription,
  buildSlackMetadata,
  isUrlVerification,
  isEventCallback,
  isForwardedToBot,
  extractForwardedText,
  extractForwardedOriginal,
  detectGranolaMetadata,
  isGranolaNotification,
  simpleHash,
  type SlackMessageEvent,
  type SlackEventCallback,
  type SlackUrlVerification,
  type SlackTaskMetadata,
} from '../lib/slack/event-handlers'
import { createForwardedFallback, createDMFallback } from '../lib/slack/ingest/classify'

describe('shouldCreateTask', () => {
  const slackUserId = 'U12345'

  const baseEvent: SlackMessageEvent = {
    type: 'message',
    channel: 'C123',
    user: 'U999',
    text: 'Hello world',
    ts: '1234567890.123456',
  }

  it('should create task for DM (channel_type = im)', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      channel_type: 'im',
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(true)
    expect(result.isDM).toBe(true)
    expect(result.reason).toBe('dm')
  })

  it('should create task for DM (channel starts with D)', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      channel: 'D123456',
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(true)
    expect(result.isDM).toBe(true)
  })

  it('should create task for mention', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      text: `Hey <@${slackUserId}> check this out`,
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(true)
    expect(result.isMention).toBe(true)
    expect(result.reason).toBe('mention')
  })

  it('should NOT create task for bot messages', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      bot_id: 'B123',
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(false)
    expect(result.reason).toBe('bot_message')
  })

  it('should NOT create task for message with subtype', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      subtype: 'message_changed',
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(false)
    expect(result.reason).toBe('subtype_message_changed')
  })

  it('should NOT create task for empty text', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      text: '',
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(false)
    expect(result.reason).toBe('empty_text')
  })

  it('should NOT create task for whitespace-only text', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      text: '   ',
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(false)
    expect(result.reason).toBe('empty_text')
  })

  it('should NOT create task for regular channel message without mention', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      channel: 'C123',
      channel_type: 'channel',
      text: 'Hello everyone',
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(false)
    expect(result.reason).toBe('no_dm_or_mention')
  })

  it('should NOT create task when different user is mentioned', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      text: 'Hey <@U99999> check this out',
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(false)
    expect(result.reason).toBe('no_dm_or_mention')
  })

  it('should create task for forwarded DM with no mention', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      channel: 'D123456',
      channel_type: 'im',
      text: '',
      attachments: [
        {
          is_msg_unfurl: true,
          text: 'Please review the Q4 budget',
          from_url: 'https://acme.slack.com/archives/C999/p1700000000000000',
          author_name: 'Alice',
        },
      ],
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(true)
    expect(result.isDM).toBe(true)
    expect(result.isForwarded).toBe(true)
    expect(result.reason).toBe('forwarded_dm')
  })

  it('should create task for forwarded DM even with empty text', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      channel_type: 'im',
      text: '',
      attachments: [
        {
          is_msg_unfurl: true,
          text: 'Deploy the new build',
          from_url: 'https://acme.slack.com/archives/C111/p1700000000000000',
        },
      ],
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(true)
    expect(result.isForwarded).toBe(true)
  })

  it('should NOT treat channel message with attachments as forwarded', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      channel: 'C123',
      channel_type: 'channel',
      attachments: [
        {
          is_msg_unfurl: true,
          text: 'Some shared message',
          from_url: 'https://acme.slack.com/archives/C999/p1700000000000000',
        },
      ],
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(false)
    expect(result.isForwarded).toBe(false)
  })

  it('should set isForwarded=false for regular DM', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      channel_type: 'im',
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(true)
    expect(result.isDM).toBe(true)
    expect(result.isForwarded).toBe(false)
    expect(result.reason).toBe('dm')
  })

  it('should create task for DM with bot_id (n8n automation)', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      channel_type: 'im',
      bot_id: 'B_N8N',
      text: 'Automated task from n8n',
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(true)
    expect(result.isDM).toBe(true)
    expect(result.reason).toBe('dm')
  })

  it('should create task for DM with bot_message subtype', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      channel_type: 'im',
      subtype: 'bot_message',
      bot_id: 'B_N8N',
      text: 'Deploy the new service',
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(true)
    expect(result.isDM).toBe(true)
    expect(result.reason).toBe('dm')
  })

  it('should create task for DM with empty text (automation edge case)', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      channel_type: 'im',
      text: '',
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(true)
    expect(result.isDM).toBe(true)
    expect(result.reason).toBe('dm')
  })

  it('should create task for DM without event.user (automation)', () => {
    const event: SlackMessageEvent = {
      type: 'message',
      channel: 'D123456',
      channel_type: 'im',
      text: 'Task from automation',
      ts: '1234567890.123456',
      // no user field
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(true)
    expect(result.isDM).toBe(true)
  })

  it('should still reject bot messages in channels', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      channel: 'C123',
      channel_type: 'channel',
      bot_id: 'B_N8N',
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(false)
    expect(result.reason).toBe('bot_message')
  })

  it('should still reject subtypes in channels', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      channel: 'C123',
      channel_type: 'channel',
      subtype: 'message_changed',
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(false)
    expect(result.reason).toBe('subtype_message_changed')
  })
})

describe('extractTaskTitle', () => {
  it('should return trimmed text', () => {
    expect(extractTaskTitle('  Hello world  ')).toBe('Hello world')
  })

  it('should collapse multiple spaces', () => {
    expect(extractTaskTitle('Hello    world')).toBe('Hello world')
  })

  it('should normalize user mentions to @user', () => {
    // normalizeSlackText converts <@U123> to @user
    expect(extractTaskTitle('<@U123> please review this')).toBe('@user please review this')
  })

  it('should normalize multiple user mentions', () => {
    expect(extractTaskTitle('<@U123> and <@U456> check this')).toBe('@user and @user check this')
  })

  it('should truncate long text', () => {
    const longText = 'A'.repeat(200)
    const result = extractTaskTitle(longText, 120)
    expect(result.length).toBeLessThanOrEqual(120)
    expect(result.endsWith('...')).toBe(true)
  })

  it('should return fallback for mention-only text', () => {
    // After normalization, <@U123> becomes @user which triggers fallback
    expect(extractTaskTitle('<@U123>')).toBe('Slack message')
  })

  it('should return fallback for empty text', () => {
    expect(extractTaskTitle('')).toBe('Slack message')
  })

  it('should extract first sentence for long messages', () => {
    const text = 'Please review this PR. It contains the new feature implementation.'
    expect(extractTaskTitle(text)).toBe('Please review this PR.')
  })
})

describe('formatTaskDescription', () => {
  it('should return normalized message text', () => {
    const result = formatTaskDescription('Hello world')
    expect(result).toBe('Hello world')
  })

  it('should normalize Slack user mentions', () => {
    const result = formatTaskDescription('<@U123> please review this')
    expect(result).toBe('@user please review this')
  })

  it('should normalize Slack URL tokens', () => {
    const result = formatTaskDescription('Check <https://example.com|this link>')
    expect(result).toBe('Check this link')
  })

  it('should truncate very long text', () => {
    const longText = 'A'.repeat(3000)
    const result = formatTaskDescription(longText)
    expect(result.length).toBeLessThanOrEqual(2000)
    expect(result).toContain('...')
  })

  it('should handle empty text', () => {
    const result = formatTaskDescription('')
    expect(result).toBe('')
  })
})

describe('buildSlackMetadata', () => {
  const baseEvent: SlackMessageEvent = {
    type: 'message',
    channel: 'C123456',
    user: 'U999',
    text: 'Hello world',
    ts: '1234567890.123456',
  }

  it('should build metadata for DM', () => {
    const metadata = buildSlackMetadata(baseEvent, 'T123', 'dm')

    expect(metadata.source.type).toBe('slack')
    expect(metadata.source.subtype).toBe('dm')
    expect(metadata.source.team_id).toBe('T123')
    expect(metadata.source.channel_id).toBe('C123456')
    expect(metadata.source.message_ts).toBe('1234567890.123456')
    expect(metadata.raw.slack_text).toBe('Hello world')
  })

  it('should build metadata for mention', () => {
    const metadata = buildSlackMetadata(baseEvent, 'T123', 'mention')

    expect(metadata.source.subtype).toBe('mention')
  })

  it('should include permalink when provided', () => {
    const metadata = buildSlackMetadata(
      baseEvent,
      'T123',
      'dm',
      undefined,
      undefined,
      'https://slack.com/archives/C123/p456'
    )

    expect(metadata.source.permalink).toBe('https://slack.com/archives/C123/p456')
  })

  it('should include author info when provided', () => {
    const metadata = buildSlackMetadata(
      baseEvent,
      'T123',
      'dm',
      'U999',
      'John Doe'
    )

    expect(metadata.source.author?.slack_user_id).toBe('U999')
    expect(metadata.source.author?.display_name).toBe('John Doe')
  })

  it('should include author user ID without display name', () => {
    const metadata = buildSlackMetadata(
      baseEvent,
      'T123',
      'dm',
      'U999'
    )

    expect(metadata.source.author?.slack_user_id).toBe('U999')
    expect(metadata.source.author?.display_name).toBeUndefined()
  })

  it('should not include author when not provided', () => {
    const metadata = buildSlackMetadata(baseEvent, 'T123', 'dm')

    expect(metadata.source.author).toBeUndefined()
  })

  it('should store raw slack text in metadata', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      text: '<@U123> check this <https://example.com|link>',
    }
    const metadata = buildSlackMetadata(event, 'T123', 'mention')

    // Raw text should be preserved with original Slack tokens
    expect(metadata.raw.slack_text).toBe('<@U123> check this <https://example.com|link>')
  })
})

describe('isForwardedToBot', () => {
  const baseEvent: SlackMessageEvent = {
    type: 'message',
    channel: 'D123',
    channel_type: 'im',
    user: 'U999',
    text: '',
    ts: '1234567890.123456',
  }

  it('should return true for DM with is_msg_unfurl attachment', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      attachments: [
        {
          is_msg_unfurl: true,
          text: 'Original message',
          from_url: 'https://acme.slack.com/archives/C123/p170000',
        },
      ],
    }
    expect(isForwardedToBot(event)).toBe(true)
  })

  it('should return true for DM with slack archives from_url', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      attachments: [
        {
          text: 'Original message',
          from_url: 'https://myteam.slack.com/archives/C456/p170000',
        },
      ],
    }
    expect(isForwardedToBot(event)).toBe(true)
  })

  it('should return false for DM without attachments', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      text: 'Just a regular DM',
    }
    expect(isForwardedToBot(event)).toBe(false)
  })

  it('should return false for DM with empty attachments', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      attachments: [],
    }
    expect(isForwardedToBot(event)).toBe(false)
  })

  it('should return false for DM with non-message attachment', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      attachments: [
        {
          text: 'Some attachment',
          fallback: 'fallback',
        },
      ],
    }
    expect(isForwardedToBot(event)).toBe(false)
  })

  it('should return false for channel message even with forwarded attachment', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      channel: 'C123',
      channel_type: 'channel',
      attachments: [
        {
          is_msg_unfurl: true,
          text: 'Forwarded content',
          from_url: 'https://acme.slack.com/archives/C789/p170000',
        },
      ],
    }
    expect(isForwardedToBot(event)).toBe(false)
  })
})

describe('extractForwardedText', () => {
  const baseEvent: SlackMessageEvent = {
    type: 'message',
    channel: 'D123',
    channel_type: 'im',
    user: 'U999',
    ts: '1234567890.123456',
  }

  it('should extract text from forwarded attachment', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      text: '',
      attachments: [
        {
          is_msg_unfurl: true,
          text: 'Please review the budget',
          from_url: 'https://acme.slack.com/archives/C123/p170000',
        },
      ],
    }
    expect(extractForwardedText(event)).toBe('Please review the budget')
  })

  it('should combine user comment with forwarded text', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      text: 'Handle this please',
      attachments: [
        {
          is_msg_unfurl: true,
          text: 'Deploy v2.1 to production',
          from_url: 'https://acme.slack.com/archives/C123/p170000',
        },
      ],
    }
    expect(extractForwardedText(event)).toBe('Handle this please\n\nDeploy v2.1 to production')
  })

  it('should use fallback when attachment text is missing', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      text: '',
      attachments: [
        {
          is_msg_unfurl: true,
          fallback: 'Fallback text for the message',
          from_url: 'https://acme.slack.com/archives/C123/p170000',
        },
      ],
    }
    expect(extractForwardedText(event)).toBe('Fallback text for the message')
  })

  it('should return event text when no attachment content', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      text: 'https://acme.slack.com/archives/C123/p170000',
      attachments: [
        {
          is_msg_unfurl: true,
          from_url: 'https://acme.slack.com/archives/C123/p170000',
        },
      ],
    }
    expect(extractForwardedText(event)).toBe('https://acme.slack.com/archives/C123/p170000')
  })

  it('should return default when no text at all', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      text: '',
      attachments: [
        {
          is_msg_unfurl: true,
          from_url: 'https://acme.slack.com/archives/C123/p170000',
        },
      ],
    }
    expect(extractForwardedText(event)).toBe('Forwarded message')
  })

  it('should only use first forwarded attachment', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      text: '',
      attachments: [
        {
          is_msg_unfurl: true,
          text: 'First forwarded message',
          from_url: 'https://acme.slack.com/archives/C123/p170000',
        },
        {
          is_msg_unfurl: true,
          text: 'Second forwarded message',
          from_url: 'https://acme.slack.com/archives/C456/p180000',
        },
      ],
    }
    expect(extractForwardedText(event)).toBe('First forwarded message')
  })
})

describe('extractForwardedOriginal', () => {
  const baseEvent: SlackMessageEvent = {
    type: 'message',
    channel: 'D123',
    channel_type: 'im',
    user: 'U_FORWARDER',
    ts: '1234567890.123456',
  }

  it('should extract original author from is_msg_unfurl attachment', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      text: '',
      attachments: [
        {
          is_msg_unfurl: true,
          text: 'Please review the budget',
          author_id: 'U_ORIGINAL',
          author_name: 'Nathan Cohen',
          channel_id: 'C999',
          channel_name: 'finance',
          ts: '1699000000.000000',
          from_url: 'https://acme.slack.com/archives/C999/p1699000000000000',
        },
      ],
    }
    const result = extractForwardedOriginal(event)
    expect(result.author_id).toBe('U_ORIGINAL')
    expect(result.author_name).toBe('Nathan Cohen')
    expect(result.text).toBe('Please review the budget')
    expect(result.channel_id).toBe('C999')
    expect(result.channel_name).toBe('finance')
    expect(result.ts).toBe('1699000000.000000')
    expect(result.permalink).toBe('https://acme.slack.com/archives/C999/p1699000000000000')
    expect(result.extraction_cue).toBe('is_msg_unfurl')
  })

  it('should extract from from_url attachment without is_msg_unfurl', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      text: '',
      attachments: [
        {
          text: 'Deploy the build',
          author_id: 'U_AUTHOR',
          author_name: 'Alice',
          from_url: 'https://myteam.slack.com/archives/C111/p170000',
        },
      ],
    }
    const result = extractForwardedOriginal(event)
    expect(result.author_id).toBe('U_AUTHOR')
    expect(result.author_name).toBe('Alice')
    expect(result.extraction_cue).toBe('from_url')
  })

  it('should return author_id without author_name when name is missing', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      text: '',
      attachments: [
        {
          is_msg_unfurl: true,
          text: 'Some message',
          author_id: 'U_NONAME',
          from_url: 'https://acme.slack.com/archives/C123/p170000',
        },
      ],
    }
    const result = extractForwardedOriginal(event)
    expect(result.author_id).toBe('U_NONAME')
    expect(result.author_name).toBeUndefined()
  })

  it('should fall back to event text when no attachments', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      text: 'Just a regular message',
    }
    const result = extractForwardedOriginal(event)
    expect(result.text).toBe('Just a regular message')
    expect(result.author_id).toBeUndefined()
    expect(result.extraction_cue).toBe('none')
  })

  it('should use attachment fallback text when attachment text is missing', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      text: '',
      attachments: [
        {
          is_msg_unfurl: true,
          fallback: 'Fallback content',
          author_name: 'Bob',
          from_url: 'https://acme.slack.com/archives/C123/p170000',
        },
      ],
    }
    const result = extractForwardedOriginal(event)
    expect(result.text).toBe('Fallback content')
    expect(result.author_name).toBe('Bob')
  })

  it('should skip non-forwarded attachments', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      text: 'event text',
      attachments: [
        {
          text: 'Some random attachment',
          fallback: 'random',
        },
      ],
    }
    const result = extractForwardedOriginal(event)
    expect(result.extraction_cue).toBe('none')
    expect(result.text).toBe('event text')
  })
})

describe('createForwardedFallback', () => {
  it('should extract first sentence as title', () => {
    const result = createForwardedFallback('Please review this document. It has the Q4 numbers.')
    expect(result.title).toBe('Please review this document.')
  })

  it('should truncate long titles to 80 chars', () => {
    const longText = 'A'.repeat(200)
    const result = createForwardedFallback(longText)
    expect(result.title.length).toBeLessThanOrEqual(80)
    expect(result.title.endsWith('...')).toBe(true)
  })

  it('should handle very short text', () => {
    const result = createForwardedFallback('Hi')
    expect(result.title).toBe('Forwarded message')
  })

  it('should clean Slack tokens in title', () => {
    const result = createForwardedFallback('<@U123> please check <https://example.com|this link>')
    expect(result.title).toContain('@user')
    expect(result.title).toContain('this link')
    expect(result.title).not.toContain('<@U123>')
  })

  it('should limit description to 6 lines', () => {
    const text = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join('\n')
    const result = createForwardedFallback(text)
    expect(result.description.split('\n').length).toBeLessThanOrEqual(6)
  })
})

describe('createDMFallback', () => {
  it('should extract first sentence as title', () => {
    const result = createDMFallback('Check the deployment logs. Something looks off.')
    expect(result.title).toBe('Check the deployment logs.')
  })

  it('should use first ~10 words when no sentence ending', () => {
    const result = createDMFallback('Deploy the new service to production by end of day tomorrow morning please')
    expect(result.title.split(/\s+/).length).toBeLessThanOrEqual(10)
  })

  it('should truncate long titles to 80 chars', () => {
    const longText = 'A'.repeat(200)
    const result = createDMFallback(longText)
    expect(result.title.length).toBeLessThanOrEqual(80)
    expect(result.title.endsWith('...')).toBe(true)
  })

  it('should handle very short text', () => {
    const result = createDMFallback('Hi')
    expect(result.title).toBe('Slack message')
  })

  it('should handle empty text', () => {
    const result = createDMFallback('')
    expect(result.title).toBe('Slack message')
  })

  it('should clean Slack tokens in title', () => {
    const result = createDMFallback('<@U123> please check <https://example.com|this link>')
    expect(result.title).toContain('@user')
    expect(result.title).toContain('this link')
    expect(result.title).not.toContain('<@U123>')
  })

  it('should produce "Task: ..." description', () => {
    const result = createDMFallback('Review the Q4 budget document')
    expect(result.description).toMatch(/^Task: /)
    expect(result.description).toContain('Review the Q4 budget document')
  })

  it('should truncate description to 200 chars', () => {
    const longText = 'A'.repeat(300)
    const result = createDMFallback(longText)
    // "Task: " prefix (6 chars) + 200 chars max for the content
    expect(result.description.length).toBeLessThanOrEqual(210)
  })

  it('should set confidence to 0 and why to llm_failed_fallback', () => {
    const result = createDMFallback('Some task text')
    expect(result.confidence).toBe(0)
    expect(result.why).toBe('llm_failed_fallback')
  })
})

describe('detectGranolaMetadata', () => {
  const baseEvent: SlackMessageEvent = {
    type: 'message',
    channel: 'D123',
    channel_type: 'im',
    user: 'U999',
    text: 'Meeting notes from today',
    ts: '1234567890.123456',
  }

  it('should detect knots.granola metadata with integration.source_url and tasks', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      metadata: {
        event_type: 'knots.granola',
        event_payload: {
          integration: {
            source_type: 'granola',
            source_url: 'https://notes.granola.ai/d/abc123',
          },
          tasks: [
            { title: 'Send email to Noah', description: 'Follow up on meeting' },
            { title: 'Review PR', description: null },
          ],
          granola_author_name: 'Sam Campion',
        },
      },
    }
    const result = detectGranolaMetadata(event)
    expect(result).not.toBeNull()
    expect(result!.isGranola).toBe(true)
    expect(result!.sourceUrl).toBe('https://notes.granola.ai/d/abc123')
    expect(result!.tasks).toHaveLength(2)
    expect(result!.tasks[0].title).toBe('Send email to Noah')
    expect(result!.tasks[1].title).toBe('Review PR')
    expect(result!.authorName).toBe('Sam Campion')
  })

  it('should fall back to granola_url when integration.source_url is missing', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      metadata: {
        event_type: 'knots.granola',
        event_payload: {
          granola_url: 'https://notes.granola.ai/d/fallback',
        },
      },
    }
    const result = detectGranolaMetadata(event)
    expect(result).not.toBeNull()
    expect(result!.sourceUrl).toBe('https://notes.granola.ai/d/fallback')
    expect(result!.tasks).toHaveLength(0)
  })

  it('should extract granola_author_id when provided', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      metadata: {
        event_type: 'knots.granola',
        event_payload: {
          integration: { source_url: 'https://notes.granola.ai/d/abc123' },
          granola_author_id: 'granola_user_42',
        },
      },
    }
    const result = detectGranolaMetadata(event)
    expect(result).not.toBeNull()
    expect(result!.authorId).toBe('granola_user_42')
    expect(result!.authorName).toBeUndefined()
  })

  it('should filter out tasks with empty titles', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      metadata: {
        event_type: 'knots.granola',
        event_payload: {
          integration: { source_url: 'https://notes.granola.ai/d/abc123' },
          tasks: [
            { title: 'Valid task' },
            { title: '' },
            { title: '  ' },
            { title: 'Another valid task' },
          ],
        },
      },
    }
    const result = detectGranolaMetadata(event)
    expect(result).not.toBeNull()
    expect(result!.tasks).toHaveLength(2)
    expect(result!.tasks[0].title).toBe('Valid task')
    expect(result!.tasks[1].title).toBe('Another valid task')
  })

  it('should handle tasks with full payload fields (tags, priority, due_hint)', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      metadata: {
        event_type: 'knots.granola',
        event_payload: {
          integration: { source_type: 'granola', source_url: 'https://notes.granola.ai/d/abc' },
          tasks: [
            {
              title: 'Monitor migration',
              description: 'IGAL migration in progress',
              priority_hint: 'high',
              due_hint: 'Wednesday',
              tags: ['migration', 'maintenance'],
            },
          ],
        },
      },
    }
    const result = detectGranolaMetadata(event)
    expect(result!.tasks[0].priority_hint).toBe('high')
    expect(result!.tasks[0].due_hint).toBe('Wednesday')
    expect(result!.tasks[0].tags).toEqual(['migration', 'maintenance'])
  })

  it('should return null when no metadata', () => {
    expect(detectGranolaMetadata(baseEvent)).toBeNull()
  })

  it('should return null when event_type is not knots.granola', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      metadata: {
        event_type: 'some.other.type',
        event_payload: { integration: { source_url: 'https://notes.granola.ai/d/x' } },
      },
    }
    expect(detectGranolaMetadata(event)).toBeNull()
  })

  it('should return null when source_url is missing from payload', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      metadata: {
        event_type: 'knots.granola',
        event_payload: { some_other_field: 'value' },
      },
    }
    expect(detectGranolaMetadata(event)).toBeNull()
  })

  it('should return null when event_payload is missing', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      metadata: {
        event_type: 'knots.granola',
      },
    }
    expect(detectGranolaMetadata(event)).toBeNull()
  })

  it('should return null when source_url is empty string', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      metadata: {
        event_type: 'knots.granola',
        event_payload: { integration: { source_url: '' } },
      },
    }
    expect(detectGranolaMetadata(event)).toBeNull()
  })

  it('should still create task for DM with Granola metadata via shouldCreateTask', () => {
    const event: SlackMessageEvent = {
      ...baseEvent,
      bot_id: 'B_N8N',
      metadata: {
        event_type: 'knots.granola',
        event_payload: {
          integration: { source_url: 'https://notes.granola.ai/d/abc123' },
          tasks: [{ title: 'Test task' }],
        },
      },
    }
    const result = shouldCreateTask(event, 'U12345')
    expect(result.shouldCreate).toBe(true)
    expect(result.isDM).toBe(true)
    expect(result.reason).toBe('dm')
  })
})

describe('isUrlVerification', () => {
  it('should return true for url_verification type', () => {
    const event: SlackUrlVerification = {
      type: 'url_verification',
      token: 'test',
      challenge: 'challenge123',
    }
    expect(isUrlVerification(event)).toBe(true)
  })

  it('should return false for event_callback type', () => {
    const event: SlackEventCallback = {
      type: 'event_callback',
      token: 'test',
      team_id: 'T123',
      api_app_id: 'A123',
      event: { type: 'message', channel: 'C123', ts: '123', text: 'hi' },
      event_id: 'E123',
      event_time: 12345,
    }
    expect(isUrlVerification(event)).toBe(false)
  })
})

describe('isEventCallback', () => {
  it('should return true for event_callback type', () => {
    const event: SlackEventCallback = {
      type: 'event_callback',
      token: 'test',
      team_id: 'T123',
      api_app_id: 'A123',
      event: { type: 'message', channel: 'C123', ts: '123', text: 'hi' },
      event_id: 'E123',
      event_time: 12345,
    }
    expect(isEventCallback(event)).toBe(true)
  })

  it('should return false for url_verification type', () => {
    const event: SlackUrlVerification = {
      type: 'url_verification',
      token: 'test',
      challenge: 'challenge123',
    }
    expect(isEventCallback(event)).toBe(false)
  })
})

describe('isGranolaNotification', () => {
  it('should detect typical Granola notification with bullet list', () => {
    const text = 'Granola tasks\n• Send email to Noah\n• Follow up with team\n\nTranscript: https://notes.granola.ai/d/abc123'
    expect(isGranolaNotification(text)).toBe(true)
  })

  it('should detect Granola notification with single task', () => {
    const text = 'Granola tasks\n• Draft proposal\n\nhttps://notes.granola.ai/d/xyz789'
    expect(isGranolaNotification(text)).toBe(true)
  })

  it('should detect Granola notification case-insensitively', () => {
    const text = 'GRANOLA tasks\n• Something\n\nTranscript: https://notes.granola.ai/d/foo'
    expect(isGranolaNotification(text)).toBe(true)
  })

  it('should NOT detect regular DM text', () => {
    expect(isGranolaNotification('Please review this PR')).toBe(false)
  })

  it('should NOT detect text with just "Granola" but no URL', () => {
    expect(isGranolaNotification('Granola tasks\n• Something')).toBe(false)
  })

  it('should NOT detect text with just granola URL but not starting with Granola', () => {
    expect(isGranolaNotification('Check this: https://notes.granola.ai/d/abc')).toBe(false)
  })

  it('should NOT detect empty text', () => {
    expect(isGranolaNotification('')).toBe(false)
  })

  it('should NOT detect undefined-ish text', () => {
    expect(isGranolaNotification(undefined as unknown as string)).toBe(false)
  })
})

describe('simpleHash', () => {
  it('should return deterministic hash for same input', () => {
    expect(simpleHash('Monitor tags migration progress')).toBe(simpleHash('Monitor tags migration progress'))
  })

  it('should return different hashes for different inputs', () => {
    expect(simpleHash('Task A')).not.toBe(simpleHash('Task B'))
  })

  it('should handle empty string', () => {
    expect(simpleHash('')).toBe('0')
  })

  it('should return a base-36 string', () => {
    const hash = simpleHash('some task title')
    expect(hash).toMatch(/^[0-9a-z]+$/)
  })
})
