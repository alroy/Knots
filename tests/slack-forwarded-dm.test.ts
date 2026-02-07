import { describe, it, expect } from 'vitest'
import {
  isForwardedToBot,
  extractForwardedContent,
  generateForwardedSourceId,
  type SlackMessageEventExtended,
} from '../lib/slack/ingest/forwarded'
import { shouldCreateTask, type SlackMessageEvent } from '../lib/slack/event-handlers'

// ─── isForwardedToBot ───────────────────────────────────────────────

describe('isForwardedToBot', () => {
  const baseDMEvent: SlackMessageEventExtended = {
    type: 'message',
    channel: 'D123456',
    channel_type: 'im',
    user: 'U_FORWARDER',
    text: 'Check this out',
    ts: '1700000000.000001',
  }

  it('should NOT detect a plain DM as forwarded', () => {
    const result = isForwardedToBot(baseDMEvent)
    expect(result.isForwarded).toBe(false)
  })

  it('should detect forwarded message with attachment is_share=true', () => {
    const event: SlackMessageEventExtended = {
      ...baseDMEvent,
      attachments: [
        {
          is_share: true,
          text: 'Original message text from #general',
          author_name: 'Alice',
          author_id: 'U_ALICE',
          channel_id: 'C_GENERAL',
          ts: '1699999999.000001',
          from_url: 'https://workspace.slack.com/archives/C_GENERAL/p1699999999000001',
        },
      ],
    }

    const result = isForwardedToBot(event)
    expect(result.isForwarded).toBe(true)
    expect(result.cues.has_attachment_share).toBe(true)
    expect(result.originalText).toBe('Original message text from #general')
    expect(result.originalAuthorName).toBe('Alice')
    expect(result.originalAuthorId).toBe('U_ALICE')
    expect(result.originalChannelId).toBe('C_GENERAL')
    expect(result.originalTs).toBe('1699999999.000001')
    expect(result.originalPermalink).toBe(
      'https://workspace.slack.com/archives/C_GENERAL/p1699999999000001'
    )
  })

  it('should detect forwarded message with attachment is_msg_unfurl=true', () => {
    const event: SlackMessageEventExtended = {
      ...baseDMEvent,
      attachments: [
        {
          is_msg_unfurl: true,
          text: 'Unfurled message content',
          from_url: 'https://acme.slack.com/archives/C999/p1234567890123456',
        },
      ],
    }

    const result = isForwardedToBot(event)
    expect(result.isForwarded).toBe(true)
    expect(result.cues.has_attachment_msg_unfurl).toBe(true)
    expect(result.cues.has_attachment_from_url).toBe(true)
    expect(result.originalPermalink).toBe(
      'https://acme.slack.com/archives/C999/p1234567890123456'
    )
  })

  it('should detect forwarded message with attachment from_url pointing to Slack', () => {
    const event: SlackMessageEventExtended = {
      ...baseDMEvent,
      attachments: [
        {
          from_url: 'https://myteam.slack.com/archives/CABC123/p1700000001000000',
          text: 'Shared message text',
          author_name: 'Bob',
        },
      ],
    }

    const result = isForwardedToBot(event)
    expect(result.isForwarded).toBe(true)
    expect(result.cues.has_attachment_from_url).toBe(true)
    expect(result.originalText).toBe('Shared message text')
    expect(result.originalAuthorName).toBe('Bob')
  })

  it('should NOT treat attachment with non-Slack from_url as forwarded', () => {
    const event: SlackMessageEventExtended = {
      ...baseDMEvent,
      attachments: [
        {
          from_url: 'https://example.com/article',
          text: 'Some article preview',
        },
      ],
    }

    const result = isForwardedToBot(event)
    expect(result.isForwarded).toBe(false)
  })

  it('should detect forwarded message with nested root object', () => {
    const event: SlackMessageEventExtended = {
      ...baseDMEvent,
      root: {
        text: 'Root message text',
        user: 'U_ROOT_AUTHOR',
        ts: '1699000000.000001',
      },
    }

    const result = isForwardedToBot(event)
    expect(result.isForwarded).toBe(true)
    expect(result.cues.has_root_or_nested_message).toBe(true)
    expect(result.originalText).toBe('Root message text')
    expect(result.originalAuthorId).toBe('U_ROOT_AUTHOR')
    expect(result.originalTs).toBe('1699000000.000001')
  })

  it('should detect forwarded message with nested message object', () => {
    const event: SlackMessageEventExtended = {
      ...baseDMEvent,
      message: {
        text: 'Nested message text',
        user: 'U_NESTED',
        ts: '1698000000.000001',
      },
    }

    const result = isForwardedToBot(event)
    expect(result.isForwarded).toBe(true)
    expect(result.cues.has_root_or_nested_message).toBe(true)
    expect(result.originalText).toBe('Nested message text')
  })

  it('should detect forwarded message with multiple cues', () => {
    const event: SlackMessageEventExtended = {
      ...baseDMEvent,
      attachments: [
        {
          is_share: true,
          is_msg_unfurl: true,
          from_url: 'https://team.slack.com/archives/C100/p1700000000000000',
          text: 'Multi-cue message',
          author_name: 'Carol',
          author_id: 'U_CAROL',
          channel_id: 'C100',
          ts: '1700000000.000000',
        },
      ],
    }

    const result = isForwardedToBot(event)
    expect(result.isForwarded).toBe(true)
    expect(result.cues.has_attachment_share).toBe(true)
    expect(result.cues.has_attachment_msg_unfurl).toBe(true)
    expect(result.cues.has_attachment_from_url).toBe(true)
  })

  it('should detect forwarded message via attachment original_url', () => {
    const event: SlackMessageEventExtended = {
      ...baseDMEvent,
      attachments: [
        {
          original_url: 'https://team.slack.com/archives/C200/p1700000000000000',
          text: 'Via original_url',
        },
      ],
    }

    const result = isForwardedToBot(event)
    expect(result.isForwarded).toBe(true)
    expect(result.cues.has_attachment_from_url).toBe(true)
  })

  it('should handle subtype + attachment combo (e.g. bot_message with share)', () => {
    const event: SlackMessageEventExtended = {
      ...baseDMEvent,
      subtype: 'bot_message',
      attachments: [
        {
          is_share: true,
          text: 'Shared via bot subtype',
          from_url: 'https://team.slack.com/archives/C300/p1700000000000000',
        },
      ],
    }

    const result = isForwardedToBot(event)
    expect(result.isForwarded).toBe(true)
    expect(result.cues.has_subtype_share).toBe(true)
    expect(result.cues.has_attachment_share).toBe(true)
  })
})

// ─── extractForwardedContent ────────────────────────────────────────

describe('extractForwardedContent', () => {
  const baseDMEvent: SlackMessageEventExtended = {
    type: 'message',
    channel: 'D123456',
    channel_type: 'im',
    user: 'U_FORWARDER',
    text: 'Wrapper text from forwarder',
    ts: '1700000000.000001',
  }

  it('should prefer originalText from detection result', () => {
    const detection = isForwardedToBot({
      ...baseDMEvent,
      attachments: [
        {
          is_share: true,
          text: 'Original from attachment',
          author_name: 'Alice',
          author_id: 'U_ALICE',
        },
      ],
    })

    const content = extractForwardedContent(baseDMEvent, detection)
    expect(content.text).toBe('Original from attachment')
    expect(content.authorName).toBe('Alice')
    expect(content.authorId).toBe('U_ALICE')
  })

  it('should fall back to attachment text if detection had no originalText', () => {
    const event: SlackMessageEventExtended = {
      ...baseDMEvent,
      attachments: [
        {
          text: 'Attachment text here',
          author_name: 'Bob',
        },
      ],
    }

    // Simulate a detection result where originalText was not set
    const detection = {
      isForwarded: true,
      cues: {
        has_attachment_share: false,
        has_attachment_msg_unfurl: false,
        has_attachment_from_url: false,
        has_subtype_share: false,
        has_rich_text_with_broadcast: false,
        has_root_or_nested_message: false,
      },
    }

    const content = extractForwardedContent(event, detection)
    expect(content.text).toBe('Attachment text here')
    expect(content.authorName).toBe('Bob')
  })

  it('should fall back to event.text if no attachment content', () => {
    const detection = {
      isForwarded: true,
      cues: {
        has_attachment_share: false,
        has_attachment_msg_unfurl: false,
        has_attachment_from_url: false,
        has_subtype_share: false,
        has_rich_text_with_broadcast: false,
        has_root_or_nested_message: false,
      },
    }

    const content = extractForwardedContent(baseDMEvent, detection)
    expect(content.text).toBe('Wrapper text from forwarder')
  })

  it('should use fallback text if everything is empty', () => {
    const emptyEvent: SlackMessageEventExtended = {
      ...baseDMEvent,
      text: '',
    }

    const detection = {
      isForwarded: true,
      cues: {
        has_attachment_share: false,
        has_attachment_msg_unfurl: false,
        has_attachment_from_url: false,
        has_subtype_share: false,
        has_rich_text_with_broadcast: false,
        has_root_or_nested_message: false,
      },
    }

    const content = extractForwardedContent(emptyEvent, detection)
    expect(content.text).toBe('Forwarded Slack message')
  })

  it('should prefer attachment fallback text', () => {
    const event: SlackMessageEventExtended = {
      ...baseDMEvent,
      attachments: [
        {
          fallback: 'Fallback text for attachment',
        },
      ],
    }

    const detection = {
      isForwarded: true,
      cues: {
        has_attachment_share: false,
        has_attachment_msg_unfurl: false,
        has_attachment_from_url: false,
        has_subtype_share: false,
        has_rich_text_with_broadcast: false,
        has_root_or_nested_message: false,
      },
    }

    const content = extractForwardedContent(event, detection)
    expect(content.text).toBe('Fallback text for attachment')
  })
})

// ─── generateForwardedSourceId ──────────────────────────────────────

describe('generateForwardedSourceId', () => {
  const baseDMEvent: SlackMessageEventExtended = {
    type: 'message',
    channel: 'D_BOT_DM',
    channel_type: 'im',
    user: 'U_FORWARDER',
    text: 'fwd msg',
    ts: '1700000000.000001',
  }

  it('should use original channel + ts when available from detection', () => {
    const detection = {
      isForwarded: true,
      cues: {
        has_attachment_share: true,
        has_attachment_msg_unfurl: false,
        has_attachment_from_url: false,
        has_subtype_share: false,
        has_rich_text_with_broadcast: false,
        has_root_or_nested_message: false,
      },
      originalChannelId: 'C_ORIGINAL',
      originalTs: '1699999999.000001',
    }

    const sourceId = generateForwardedSourceId('T_TEAM', baseDMEvent, detection)
    expect(sourceId).toBe('T_TEAM:C_ORIGINAL:1699999999.000001')
  })

  it('should parse original coordinates from permalink if channel/ts not directly available', () => {
    const detection = {
      isForwarded: true,
      cues: {
        has_attachment_share: false,
        has_attachment_msg_unfurl: false,
        has_attachment_from_url: true,
        has_subtype_share: false,
        has_rich_text_with_broadcast: false,
        has_root_or_nested_message: false,
      },
      originalPermalink: 'https://team.slack.com/archives/CABC123/p1700000001000000',
    }

    const sourceId = generateForwardedSourceId('T_TEAM', baseDMEvent, detection)
    // Permalink p1700000001000000 → ts = 1700000001.000000
    expect(sourceId).toBe('T_TEAM:CABC123:1700000001.000000')
  })

  it('should fall back to DM message coordinates when no original info', () => {
    const detection = {
      isForwarded: true,
      cues: {
        has_attachment_share: false,
        has_attachment_msg_unfurl: false,
        has_attachment_from_url: false,
        has_subtype_share: false,
        has_rich_text_with_broadcast: false,
        has_root_or_nested_message: false,
      },
    }

    const sourceId = generateForwardedSourceId('T_TEAM', baseDMEvent, detection)
    expect(sourceId).toBe('T_TEAM:D_BOT_DM:1700000000.000001')
  })

  it('should produce same source_id for same original message forwarded twice', () => {
    const detection1 = {
      isForwarded: true,
      cues: {
        has_attachment_share: true,
        has_attachment_msg_unfurl: false,
        has_attachment_from_url: false,
        has_subtype_share: false,
        has_rich_text_with_broadcast: false,
        has_root_or_nested_message: false,
      },
      originalChannelId: 'C_ORIG',
      originalTs: '1699000000.000001',
    }

    // Second forward has different DM ts but same original
    const event2: SlackMessageEventExtended = {
      ...baseDMEvent,
      ts: '1700000099.999999', // different DM timestamp
    }

    const detection2 = { ...detection1 }

    const id1 = generateForwardedSourceId('T_TEAM', baseDMEvent, detection1)
    const id2 = generateForwardedSourceId('T_TEAM', event2, detection2)

    expect(id1).toBe(id2)
    expect(id1).toBe('T_TEAM:C_ORIG:1699000000.000001')
  })
})

// ─── Non-regression: plain DM is not affected ──────────────────────

describe('Non-regression: plain DM detection', () => {
  it('should NOT treat a plain text DM as forwarded', () => {
    const plainDM: SlackMessageEventExtended = {
      type: 'message',
      channel: 'D123456',
      channel_type: 'im',
      user: 'U_SENDER',
      text: 'Hey, can you take a look at the deploy?',
      ts: '1700000000.000001',
    }

    const result = isForwardedToBot(plainDM)
    expect(result.isForwarded).toBe(false)
    // All cues should be false
    expect(result.cues.has_attachment_share).toBe(false)
    expect(result.cues.has_attachment_msg_unfurl).toBe(false)
    expect(result.cues.has_attachment_from_url).toBe(false)
    expect(result.cues.has_subtype_share).toBe(false)
    expect(result.cues.has_rich_text_with_broadcast).toBe(false)
    expect(result.cues.has_root_or_nested_message).toBe(false)
  })

  it('should NOT treat DM with non-Slack URL attachment as forwarded', () => {
    const dmWithLink: SlackMessageEventExtended = {
      type: 'message',
      channel: 'D123456',
      channel_type: 'im',
      user: 'U_SENDER',
      text: 'Check this article: https://example.com/post',
      ts: '1700000000.000001',
      attachments: [
        {
          from_url: 'https://example.com/post',
          text: 'Article preview',
        },
      ],
    }

    const result = isForwardedToBot(dmWithLink)
    expect(result.isForwarded).toBe(false)
  })
})

// ─── Non-regression: shouldCreateTask unchanged ─────────────────────

describe('Non-regression: shouldCreateTask is unchanged', () => {
  const slackUserId = 'U12345'

  it('should still create task for plain DM', () => {
    const event: SlackMessageEvent = {
      type: 'message',
      channel: 'D123456',
      channel_type: 'im',
      user: 'U999',
      text: 'Hello world',
      ts: '1234567890.123456',
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(true)
    expect(result.isDM).toBe(true)
    expect(result.reason).toBe('dm')
  })

  it('should still create task for mention', () => {
    const event: SlackMessageEvent = {
      type: 'message',
      channel: 'C123',
      user: 'U999',
      text: `Hey <@${slackUserId}> check this`,
      ts: '1234567890.123456',
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(true)
    expect(result.isMention).toBe(true)
  })

  it('should still reject bot messages', () => {
    const event: SlackMessageEvent = {
      type: 'message',
      channel: 'D123456',
      channel_type: 'im',
      user: 'U999',
      text: 'Bot says hi',
      ts: '123',
      bot_id: 'B123',
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(false)
    expect(result.reason).toBe('bot_message')
  })

  it('should still reject messages with subtypes', () => {
    const event: SlackMessageEvent = {
      type: 'message',
      channel: 'C123',
      user: 'U999',
      text: 'Edited message',
      ts: '123',
      subtype: 'message_changed',
    }
    const result = shouldCreateTask(event, slackUserId)
    expect(result.shouldCreate).toBe(false)
    expect(result.reason).toBe('subtype_message_changed')
  })
})
