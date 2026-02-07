/**
 * LLM Classification Layer for Slack Mentions
 *
 * Uses Claude to classify whether a Slack mention is a task and extract
 * title, description, and other metadata.
 */

import Anthropic from '@anthropic-ai/sdk'
import {
  SlackIngestMessage,
  LLMTaskClassification,
  LLMTaskClassificationSchema,
  ValidatedLLMResponse,
} from './types'

/**
 * Result of LLM classification
 */
export interface ClassificationResult {
  success: boolean
  classification: LLMTaskClassification | null
  error?: string
  rawResponse?: string
  repairAttempted?: boolean
}

/**
 * Fallback result when LLM fails
 */
export interface FallbackResult {
  title: string
  description: string
  llm_confidence: null
  llm_why: 'llm_failed_validation'
}

/**
 * Build the system prompt for task classification
 */
function buildSystemPrompt(): string {
  return `You are a task classification assistant. Your job is to analyze Slack messages where a user is mentioned and determine if the message represents an actionable task for that user.

CRITICAL INSTRUCTIONS:
- Every input message includes a mention of the user. Do NOT treat that as evidence of a task.
- A message is task material ONLY if it implies an action the user should take (respond, decide, review, create, change, investigate, deliver) or contains a clear request/deadline/ownership.
- Informational routing mentions ("FYI", "for visibility", "looping you in") are NOT tasks unless they include an explicit ask or deadline.
- Do NOT invent missing context. If unclear, set is_task=false.

You MUST respond with valid JSON only. No markdown, no explanation, no extra keys.

JSON Schema (strict):
{
  "is_task": boolean,
  "confidence": number (0 to 1),
  "title": string (required if is_task=true, 3-80 chars, phrase as user's next action),
  "description": string (1-6 lines of essential context, may be empty),
  "why": string (short reason for your decision, for logging),
  "task_type": "follow_up" | "bug" | "decision" | "research" | "admin" | "misc" (optional),
  "due_hint": string (optional, any deadline mentioned),
  "assignees_hint": string or array (optional, other people involved)
}

Title rules:
- Phrase as the user's next action (e.g., "Review PR #123", "Respond to design feedback")
- Keep it short and concrete
- Avoid channel names and usernames unless necessary

Description rules:
- 1-6 lines, include essential context
- Include any deadline or request phrasing if present
- Do NOT add facts not in the Slack text`
}

/**
 * Build the user prompt with the Slack message
 */
function buildUserPrompt(message: SlackIngestMessage): string {
  let prompt = `Analyze this Slack message and determine if it's an actionable task:

---
Message: "${message.text}"
`

  if (message.user_name) {
    prompt += `From: ${message.user_name}
`
  }

  if (message.channel_name) {
    prompt += `Channel: #${message.channel_name}
`
  }

  if (message.thread_ts) {
    prompt += `(This is a reply in a thread)
`
  }

  prompt += `---

Respond with JSON only.`

  return prompt
}

/**
 * Parse and validate LLM response
 */
function parseAndValidate(
  response: string
): { valid: true; data: ValidatedLLMResponse } | { valid: false; error: string } {
  // Try to extract JSON if wrapped in markdown code blocks
  let jsonStr = response.trim()
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim()
  }

  try {
    const parsed = JSON.parse(jsonStr)
    const result = LLMTaskClassificationSchema.safeParse(parsed)

    if (!result.success) {
      return { valid: false, error: result.error.message }
    }

    // Additional validation: if is_task=true, title must be valid
    if (result.data.is_task) {
      if (!result.data.title || result.data.title.length < 3) {
        return { valid: false, error: 'Title required when is_task=true' }
      }
      if (result.data.title.length > 80) {
        return { valid: false, error: 'Title must be 80 chars or less' }
      }
    }

    return { valid: true, data: result.data }
  } catch (e) {
    return { valid: false, error: `Invalid JSON: ${(e as Error).message}` }
  }
}

/**
 * Build repair prompt when initial response is invalid
 */
function buildRepairPrompt(invalidResponse: string, error: string): string {
  return `Your previous response was invalid JSON or failed schema validation.

Error: ${error}

Your invalid response:
${invalidResponse}

Please provide a corrected JSON response following the exact schema. Respond with JSON only, no markdown.`
}

/**
 * Create a fallback result from the message when LLM fails
 */
export function createFallbackFromMessage(
  message: SlackIngestMessage
): FallbackResult {
  // Extract first 8-12 words for title
  const words = message.text.split(/\s+/).filter((w) => w.length > 0)
  const titleWords = words.slice(0, 10)
  let title = titleWords.join(' ')

  // Clean up Slack tokens in title
  title = title
    .replace(/<@[A-Z0-9]+>/gi, '@user')
    .replace(/<#[A-Z0-9]+\|([^>]+)>/gi, '#$1')
    .replace(/<https?:\/\/[^|>]+\|([^>]+)>/gi, '$1')
    .replace(/<https?:\/\/[^>]+>/gi, '[link]')

  if (title.length > 80) {
    title = title.substring(0, 77) + '...'
  }

  if (title.length < 3) {
    title = 'Slack message'
  }

  return {
    title,
    description: message.text,
    llm_confidence: null,
    llm_why: 'llm_failed_validation',
  }
}

/**
 * Classify a Slack mention using Claude
 *
 * @param message - Normalized Slack message
 * @returns Classification result
 */
export async function classifySlackMention(
  message: SlackIngestMessage
): Promise<ClassificationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return {
      success: false,
      classification: null,
      error: 'ANTHROPIC_API_KEY not configured',
    }
  }

  const client = new Anthropic({ apiKey })

  try {
    // First attempt
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      system: buildSystemPrompt(),
      messages: [{ role: 'user', content: buildUserPrompt(message) }],
    })

    const rawResponse =
      response.content[0].type === 'text' ? response.content[0].text : ''
    const parseResult = parseAndValidate(rawResponse)

    if (parseResult.valid) {
      return {
        success: true,
        classification: parseResult.data,
        rawResponse,
      }
    }

    // Repair attempt
    const repairResponse = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      system: buildSystemPrompt(),
      messages: [
        { role: 'user', content: buildUserPrompt(message) },
        { role: 'assistant', content: rawResponse },
        { role: 'user', content: buildRepairPrompt(rawResponse, parseResult.error) },
      ],
    })

    const repairRaw =
      repairResponse.content[0].type === 'text'
        ? repairResponse.content[0].text
        : ''
    const repairResult = parseAndValidate(repairRaw)

    if (repairResult.valid) {
      return {
        success: true,
        classification: repairResult.data,
        rawResponse: repairRaw,
        repairAttempted: true,
      }
    }

    // Both attempts failed
    return {
      success: false,
      classification: null,
      error: repairResult.error,
      rawResponse: repairRaw,
      repairAttempted: true,
    }
  } catch (error) {
    return {
      success: false,
      classification: null,
      error: `LLM API error: ${(error as Error).message}`,
    }
  }
}

/**
 * Shaped task output from a forwarded message
 */
export interface ForwardedTaskShape {
  title: string
  description: string
}

/**
 * Build fallback title/description from forwarded text when LLM is unavailable or fails.
 */
export function createForwardedFallback(text: string): ForwardedTaskShape {
  // Clean Slack tokens
  let cleaned = text
    .replace(/<@[A-Z0-9]+>/gi, '@user')
    .replace(/<#[A-Z0-9]+\|([^>]+)>/gi, '#$1')
    .replace(/<https?:\/\/[^|>]+\|([^>]+)>/gi, '$1')
    .replace(/<https?:\/\/[^>]+>/gi, '[link]')

  // Title: first sentence or first 80 chars
  const sentenceMatch = cleaned.match(/^(.+?[.!?])(?:\s|$)/)
  let title = sentenceMatch ? sentenceMatch[1] : cleaned
  if (title.length > 80) {
    const lastSpace = title.substring(0, 77).lastIndexOf(' ')
    title = (lastSpace > 40 ? title.substring(0, lastSpace) : title.substring(0, 77)) + '...'
  }
  if (title.length < 3) title = 'Forwarded message'

  // Description: first 6 lines, max 500 chars
  const lines = cleaned.split(/\n/).slice(0, 6)
  let description = lines.join('\n')
  if (description.length > 500) {
    description = description.substring(0, 497) + '...'
  }

  return { title, description }
}

/**
 * Use LLM to transform a forwarded message into a task-shaped title and description.
 *
 * The LLM never vetoes — it always produces a task. If the API call fails,
 * returns null so the caller can use the fallback.
 */
export async function shapeForwardedMessage(
  text: string,
  authorName?: string
): Promise<ForwardedTaskShape | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const client = new Anthropic({ apiKey })

  const systemPrompt = `You are a task extraction assistant. A user forwarded a Slack message to their task bot. Transform this message into a clear, actionable task.

The user forwarded this intentionally — it IS a task. Do not question whether it's a task.

You MUST respond with valid JSON only. No markdown, no explanation.

JSON Schema:
{
  "title": string (3-80 chars, imperative, specific, phrase as next action),
  "description": string (1-6 lines of essential context, may be empty)
}

Title rules:
- Phrase as the user's next action (e.g., "Review Q4 budget proposal", "Follow up on deployment timeline")
- Keep it short and concrete
- Do not include the author's name in the title

Description rules:
- 1-6 lines of essential context
- Include any deadlines, requirements, or key details
- Do NOT copy the entire message verbatim
- Do NOT add facts not in the original message`

  let userPrompt = `Transform this forwarded Slack message into a task:\n\n---\n"${text}"\n`
  if (authorName) {
    userPrompt += `From: ${authorName}\n`
  }
  userPrompt += `---\n\nRespond with JSON only.`

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    let jsonStr = raw.trim()
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim()

    const parsed = JSON.parse(jsonStr)
    const title = typeof parsed.title === 'string' && parsed.title.length >= 3 && parsed.title.length <= 80
      ? parsed.title
      : null
    const description = typeof parsed.description === 'string' ? parsed.description : ''

    if (!title) return null

    return { title, description }
  } catch (error) {
    console.error('LLM shapeForwardedMessage failed:', error)
    return null
  }
}

/**
 * Shaped task output from a DM message
 */
export interface DMTaskShape {
  title: string
  description: string
  confidence: number
  why: string
}

/**
 * Build fallback title/description from DM text when LLM is unavailable or fails.
 *
 * Produces a task-shaped result:
 * - title: first sentence or first ~10 words, cleaned
 * - description: "Task: <cleaned text in <= 200 chars>"
 */
export function createDMFallback(text: string): DMTaskShape {
  // Clean Slack tokens
  let cleaned = text
    .replace(/<@[A-Z0-9]+>/gi, '@user')
    .replace(/<#[A-Z0-9]+\|([^>]+)>/gi, '#$1')
    .replace(/<https?:\/\/[^|>]+\|([^>]+)>/gi, '$1')
    .replace(/<https?:\/\/[^>]+>/gi, '[link]')

  // Title: first sentence or first ~10 words
  const sentenceMatch = cleaned.match(/^(.+?[.!?])(?:\s|$)/)
  let title: string
  if (sentenceMatch) {
    title = sentenceMatch[1]
  } else {
    const words = cleaned.split(/\s+/).filter((w) => w.length > 0)
    title = words.slice(0, 10).join(' ')
  }

  if (title.length > 80) {
    const lastSpace = title.substring(0, 77).lastIndexOf(' ')
    title = (lastSpace > 40 ? title.substring(0, lastSpace) : title.substring(0, 77)) + '...'
  }
  if (title.length < 3) title = 'Slack message'

  // Description: 1-3 lines — "Task:" line with truncation
  let taskLine = cleaned
  if (taskLine.length > 200) {
    taskLine = taskLine.substring(0, 197) + '...'
  }

  return {
    title,
    description: `Task: ${taskLine}`,
    confidence: 0,
    why: 'llm_failed_fallback',
  }
}

/**
 * Use LLM to transform a DM message into a task-shaped title and description.
 *
 * The LLM never vetoes — it always produces a task. If the API call fails,
 * returns null so the caller can use the fallback.
 */
export async function shapeDMMessage(
  text: string,
  senderName?: string
): Promise<DMTaskShape | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const client = new Anthropic({ apiKey })

  const systemPrompt = `You are a task extraction assistant. A user sent a message to their task bot via DM. Transform this message into a clear, actionable task.

The user sent this intentionally — it IS a task. Do not question whether it's a task.

You MUST respond with valid JSON only. No markdown, no explanation.

JSON Schema (strict):
{
  "title": string (3-80 chars, imperative, specific, phrase as next action),
  "description": string (1-6 lines of essential context, may be empty),
  "confidence": number (0 to 1),
  "why": string (short reason for your decision, for logging)
}

Title rules:
- Phrase as the user's next action (e.g., "Review Q4 budget proposal", "Follow up on deployment timeline")
- Keep it short and concrete
- Do not invent facts not present in the text
- Do not output the entire original text verbatim unless it is already a clean task
- If the text contains multiple actions, pick the primary action for the title and put the rest in the description
- If the text is ambiguous, produce a reasonable "follow up / clarify" task rather than dumping raw text

Description rules:
- 1-6 lines of essential context
- Include any deadlines, requirements, or key details
- Do NOT copy the entire message verbatim
- Do NOT add facts not in the original message`

  let userPrompt = `Transform this DM into a task:\n\n---\n"${text}"\n`
  if (senderName) {
    userPrompt += `From: ${senderName}\n`
  }
  userPrompt += `---\n\nRespond with JSON only.`

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    let jsonStr = raw.trim()
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim()

    const parsed = JSON.parse(jsonStr)
    const title =
      typeof parsed.title === 'string' && parsed.title.length >= 3 && parsed.title.length <= 80
        ? parsed.title
        : null
    const description = typeof parsed.description === 'string' ? parsed.description : ''
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5
    const why = typeof parsed.why === 'string' ? parsed.why : 'llm_shaped'

    if (!title) return null

    return { title, description, confidence, why }
  } catch (error) {
    console.error('LLM shapeDMMessage failed:', error)
    return null
  }
}

/**
 * Classify with fallback - always returns a usable result
 */
export async function classifyWithFallback(
  message: SlackIngestMessage
): Promise<{
  classification: LLMTaskClassification
  usedFallback: boolean
}> {
  const result = await classifySlackMention(message)

  if (result.success && result.classification) {
    return {
      classification: result.classification,
      usedFallback: false,
    }
  }

  // Use fallback
  const fallback = createFallbackFromMessage(message)
  return {
    classification: {
      is_task: true,
      confidence: 0.5, // Neutral confidence for fallback
      title: fallback.title,
      description: fallback.description,
      why: fallback.llm_why,
    },
    usedFallback: true,
  }
}
