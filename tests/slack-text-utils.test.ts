import { describe, it, expect } from 'vitest'
import {
  normalizeSlackText,
  deriveTitleFromSlackMessage,
  stripSlackSourceBlock,
  detectSlackTask,
  truncateForListView,
  prepareTaskForListView,
  prepareDescriptionForEdit,
} from '../lib/slack/text-utils'

describe('normalizeSlackText', () => {
  describe('user mentions', () => {
    it('should replace user mention with @user when no map provided', () => {
      expect(normalizeSlackText('Hey <@U123ABC> check this')).toBe('Hey @user check this')
    })

    it('should replace user mention with display name from Map', () => {
      const userMap = new Map([['U123ABC', 'Alice']])
      expect(normalizeSlackText('Hey <@U123ABC> check this', userMap)).toBe('Hey @Alice check this')
    })

    it('should replace user mention with display name from object', () => {
      const userMap = { U123ABC: 'Bob' }
      expect(normalizeSlackText('Hey <@U123ABC> check this', userMap)).toBe('Hey @Bob check this')
    })

    it('should use inline display name when present', () => {
      expect(normalizeSlackText('Hey <@U123ABC|Charlie> check this')).toBe('Hey @Charlie check this')
    })

    it('should handle multiple mentions', () => {
      const userMap = { U111: 'Alice', U222: 'Bob' }
      expect(normalizeSlackText('<@U111> and <@U222> please review', userMap))
        .toBe('@Alice and @Bob please review')
    })

    it('should fallback to @user for unknown user IDs', () => {
      const userMap = { U111: 'Alice' }
      expect(normalizeSlackText('<@U999> check this', userMap)).toBe('@user check this')
    })
  })

  describe('channel mentions', () => {
    it('should replace channel mention with channel name', () => {
      expect(normalizeSlackText('Post in <#C123ABC|general>')).toBe('Post in #general')
    })

    it('should replace channel mention without name with #channel', () => {
      expect(normalizeSlackText('Post in <#C123ABC>')).toBe('Post in #channel')
    })
  })

  describe('special mentions', () => {
    it('should replace <!here> with @here', () => {
      expect(normalizeSlackText('<!here> attention please')).toBe('@here attention please')
    })

    it('should replace <!channel> with @channel', () => {
      expect(normalizeSlackText('<!channel> important update')).toBe('@channel important update')
    })

    it('should replace <!everyone> with @everyone', () => {
      expect(normalizeSlackText('<!everyone> announcement')).toBe('@everyone announcement')
    })
  })

  describe('URL tokens', () => {
    it('should extract label from URL token', () => {
      expect(normalizeSlackText('Check <https://example.com|this link>')).toBe('Check this link')
    })

    it('should keep URL when no label provided', () => {
      expect(normalizeSlackText('Visit <https://example.com>')).toBe('Visit https://example.com')
    })

    it('should handle mailto tokens with label', () => {
      expect(normalizeSlackText('Email <mailto:test@example.com|John>')).toBe('Email John')
    })

    it('should handle mailto tokens without label', () => {
      expect(normalizeSlackText('Email <mailto:test@example.com>')).toBe('Email test@example.com')
    })
  })

  describe('whitespace handling', () => {
    it('should collapse multiple spaces', () => {
      expect(normalizeSlackText('Hello    world')).toBe('Hello world')
    })

    it('should collapse newlines and tabs', () => {
      expect(normalizeSlackText('Hello\n\nworld\t\there')).toBe('Hello world here')
    })

    it('should trim leading and trailing whitespace', () => {
      expect(normalizeSlackText('  Hello world  ')).toBe('Hello world')
    })
  })

  describe('edge cases', () => {
    it('should return empty string for null/undefined', () => {
      expect(normalizeSlackText('')).toBe('')
      expect(normalizeSlackText(null as unknown as string)).toBe('')
      expect(normalizeSlackText(undefined as unknown as string)).toBe('')
    })

    it('should handle text with no Slack tokens', () => {
      expect(normalizeSlackText('Regular text here')).toBe('Regular text here')
    })

    it('should handle complex mixed content', () => {
      const input = '<@U123> check <https://github.com/repo|this PR> in <#C456|dev-channel>'
      const expected = '@user check this PR in #dev-channel'
      expect(normalizeSlackText(input)).toBe(expected)
    })
  })
})

describe('deriveTitleFromSlackMessage', () => {
  it('should return cleaned first sentence', () => {
    expect(deriveTitleFromSlackMessage('Please review this. It is urgent.'))
      .toBe('Please review this.')
  })

  it('should normalize Slack tokens in title', () => {
    expect(deriveTitleFromSlackMessage('<@U123> please check this task'))
      .toBe('@user please check this task')
  })

  it('should truncate long text', () => {
    const longText = 'A'.repeat(200)
    const result = deriveTitleFromSlackMessage(longText, 120)
    expect(result.length).toBeLessThanOrEqual(120)
    expect(result.endsWith('...')).toBe(true)
  })

  it('should break at word boundary when truncating', () => {
    const text = 'This is a somewhat long sentence that needs to be truncated at a reasonable point for display'
    const result = deriveTitleFromSlackMessage(text, 50)
    expect(result.endsWith('...')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(50)
  })

  it('should return fallback for empty text', () => {
    expect(deriveTitleFromSlackMessage('')).toBe('Slack message')
  })

  it('should return fallback for whitespace-only text', () => {
    expect(deriveTitleFromSlackMessage('   ')).toBe('Slack message')
  })

  it('should return fallback for numeric-only text', () => {
    expect(deriveTitleFromSlackMessage('12345')).toBe('Slack message')
    expect(deriveTitleFromSlackMessage('123 456')).toBe('Slack message')
    expect(deriveTitleFromSlackMessage('1,234.56')).toBe('Slack message')
  })

  it('should return fallback for very short text', () => {
    expect(deriveTitleFromSlackMessage('Hi')).toBe('Slack message')
    expect(deriveTitleFromSlackMessage('OK')).toBe('Slack message')
  })

  it('should return fallback when only mentions remain', () => {
    expect(deriveTitleFromSlackMessage('<@U123>')).toBe('Slack message')
  })

  it('should handle text with only punctuation after normalization', () => {
    expect(deriveTitleFromSlackMessage('!!!')).toBe('Slack message')
    expect(deriveTitleFromSlackMessage('...')).toBe('Slack message')
  })

  it('should use custom max length', () => {
    const text = 'This is a test message for truncation'
    const result = deriveTitleFromSlackMessage(text, 20)
    expect(result.length).toBeLessThanOrEqual(20)
  })

  it('should use provided user map for mentions', () => {
    const userMap = { U123: 'Alice' }
    expect(deriveTitleFromSlackMessage('<@U123> please review', 120, userMap))
      .toBe('@Alice please review')
  })
})

describe('stripSlackSourceBlock', () => {
  it('should remove source block with DM', () => {
    const input = 'Task content here\n---\nSource: Slack DM'
    expect(stripSlackSourceBlock(input)).toBe('Task content here')
  })

  it('should remove source block with mention', () => {
    const input = 'Task content here\n---\nSource: Slack mention'
    expect(stripSlackSourceBlock(input)).toBe('Task content here')
  })

  it('should remove source block with From field', () => {
    const input = 'Task content here\n---\nFrom: John Doe | Source: Slack DM'
    expect(stripSlackSourceBlock(input)).toBe('Task content here')
  })

  it('should remove source block with Link field', () => {
    const input = 'Task content here\n---\nFrom: Jane | Source: Slack mention | Link: https://slack.com/msg/123'
    expect(stripSlackSourceBlock(input)).toBe('Task content here')
  })

  it('should preserve content without source block', () => {
    const input = 'Regular task description'
    expect(stripSlackSourceBlock(input)).toBe('Regular task description')
  })

  it('should handle empty string', () => {
    expect(stripSlackSourceBlock('')).toBe('')
  })

  it('should handle null/undefined', () => {
    expect(stripSlackSourceBlock(null as unknown as string)).toBe('')
    expect(stripSlackSourceBlock(undefined as unknown as string)).toBe('')
  })

  it('should handle multiline content before source block', () => {
    const input = 'Line 1\nLine 2\nLine 3\n---\nSource: Slack DM'
    expect(stripSlackSourceBlock(input)).toBe('Line 1\nLine 2\nLine 3')
  })
})

describe('detectSlackTask', () => {
  it('should detect Slack DM task', () => {
    const description = 'Content here\n---\nSource: Slack DM'
    const result = detectSlackTask(description)
    expect(result.isSlack).toBe(true)
    expect(result.subtype).toBe('dm')
  })

  it('should detect Slack mention task', () => {
    const description = 'Content here\n---\nSource: Slack mention'
    const result = detectSlackTask(description)
    expect(result.isSlack).toBe(true)
    expect(result.subtype).toBe('mention')
  })

  it('should extract permalink', () => {
    const description = 'Content\n---\nSource: Slack DM | Link: https://slack.com/archives/C123/p456'
    const result = detectSlackTask(description)
    expect(result.isSlack).toBe(true)
    expect(result.permalink).toBe('https://slack.com/archives/C123/p456')
  })

  it('should extract sender name', () => {
    const description = 'Content\n---\nFrom: Alice Smith | Source: Slack mention'
    const result = detectSlackTask(description)
    expect(result.isSlack).toBe(true)
    expect(result.senderName).toBe('Alice Smith')
  })

  it('should return isSlack false for regular task', () => {
    const description = 'Just a regular task description'
    const result = detectSlackTask(description)
    expect(result.isSlack).toBe(false)
    expect(result.subtype).toBeUndefined()
  })

  it('should return isSlack false for empty description', () => {
    expect(detectSlackTask('').isSlack).toBe(false)
    expect(detectSlackTask(null as unknown as string).isSlack).toBe(false)
  })

  it('should handle case variations', () => {
    const description = 'Content\n---\nSource: Slack DM'
    expect(detectSlackTask(description).isSlack).toBe(true)
  })
})

describe('truncateForListView', () => {
  it('should not truncate short text', () => {
    expect(truncateForListView('Short text', 100)).toBe('Short text')
  })

  it('should truncate long text with ellipsis', () => {
    const longText = 'This is a very long text that exceeds the maximum length for display'
    const result = truncateForListView(longText, 30)
    expect(result.length).toBeLessThanOrEqual(30)
    expect(result.endsWith('...')).toBe(true)
  })

  it('should break at word boundary', () => {
    const text = 'Hello world this is a test'
    const result = truncateForListView(text, 20)
    expect(result).toBe('Hello world this...')
  })

  it('should handle empty string', () => {
    expect(truncateForListView('', 100)).toBe('')
  })

  it('should handle null/undefined', () => {
    expect(truncateForListView(null as unknown as string, 100)).toBe('')
  })

  it('should use default max length of 100', () => {
    const longText = 'A'.repeat(150)
    const result = truncateForListView(longText)
    expect(result.length).toBeLessThanOrEqual(100)
  })
})

describe('prepareTaskForListView', () => {
  it('should normalize title and description', () => {
    const result = prepareTaskForListView(
      '<@U123> review this',
      '<@U456> sent this message\n---\nSource: Slack DM'
    )
    expect(result.title).toBe('@user review this')
    expect(result.description).toBe('@user sent this message')
  })

  it('should strip source block from description', () => {
    const result = prepareTaskForListView(
      'Task title',
      'Description content\n---\nFrom: John | Source: Slack mention'
    )
    expect(result.description).toBe('Description content')
  })

  it('should truncate long description', () => {
    const longDesc = 'A'.repeat(200)
    const result = prepareTaskForListView('Title', longDesc)
    expect(result.description.length).toBeLessThanOrEqual(100)
  })

  it('should use user map for mentions', () => {
    const userMap = { U123: 'Alice' }
    const result = prepareTaskForListView(
      '<@U123> check this',
      'Message from <@U123>',
      userMap
    )
    expect(result.title).toBe('@Alice check this')
    expect(result.description).toBe('Message from @Alice')
  })

  it('should preserve original title if normalization results in empty', () => {
    const result = prepareTaskForListView('Regular title', 'Regular description')
    expect(result.title).toBe('Regular title')
    expect(result.description).toBe('Regular description')
  })
})

describe('prepareDescriptionForEdit', () => {
  it('should strip source block but keep full text', () => {
    const longContent = 'A'.repeat(500)
    const description = `${longContent}\n---\nSource: Slack DM`
    const result = prepareDescriptionForEdit(description)
    expect(result).toBe(longContent)
    expect(result.length).toBe(500)
  })

  it('should preserve description without source block', () => {
    const description = 'Regular description with\nmultiple lines'
    expect(prepareDescriptionForEdit(description)).toBe(description)
  })

  it('should handle empty string', () => {
    expect(prepareDescriptionForEdit('')).toBe('')
  })

  it('should handle null/undefined', () => {
    expect(prepareDescriptionForEdit(null as unknown as string)).toBe('')
  })

  it('should preserve Slack tokens (not normalized)', () => {
    // Edit form should show original content (minus source block)
    // Normalization happens at display time in the card
    const description = '<@U123> check this\n---\nSource: Slack DM'
    const result = prepareDescriptionForEdit(description)
    // Note: This test documents current behavior - the function strips
    // the source block but doesn't normalize. If we want normalization
    // in edit, we'd change this.
    expect(result).toBe('<@U123> check this')
  })
})
