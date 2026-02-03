import { NextResponse } from 'next/server'
import { verifySlackSignature, getSlackHeaders } from '@/lib/slack/verify-signature'
import { createAdminClient } from '@/lib/supabase-admin'
import { resolveUserMentions, fetchSlackUser } from '@/lib/slack/api'
import {
  normalizeSlackPayload,
  generateSourceId,
  isValidForProcessing,
  computeActionabilityScore,
  shouldCallLLM,
  getRequiredConfidence,
  classifySlackMention,
  createFallbackFromMessage,
  createTaskFromSource,
  buildTaskInput,
  ensurePermalink,
  IngestDecision,
  IngestPipelineResult,
  SlackIngestMessage,
  INGEST_THRESHOLDS,
} from '@/lib/slack/ingest'

/**
 * Raw Slack event callback structure
 */
interface SlackEventCallback {
  type: 'event_callback' | 'url_verification'
  token: string
  team_id: string
  api_app_id: string
  event: {
    type: 'message'
    subtype?: string
    channel: string
    channel_type?: string
    user?: string
    text?: string
    ts: string
    thread_ts?: string
    bot_id?: string
    team?: string
  }
  event_id: string
  event_time: number
  authorizations?: Array<{
    user_id: string
  }>
  challenge?: string
}

/**
 * Log an ingest decision to the database
 */
async function logIngestDecision(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  sourceId: string,
  score: number,
  llmCalled: boolean,
  llmIsTask: boolean | undefined,
  llmConfidence: number | undefined,
  decision: IngestDecision
): Promise<void> {
  try {
    await supabase.from('slack_mention_ingest_log').insert({
      source_id: sourceId,
      user_id: userId,
      actionability_score: score,
      llm_called: llmCalled,
      llm_is_task: llmIsTask,
      llm_confidence: llmConfidence,
      decision,
    })
  } catch (error) {
    console.error('Failed to log ingest decision:', error)
    // Don't throw - logging failure shouldn't block the pipeline
  }
}

/**
 * Process a Slack mention through the heuristic + LLM pipeline
 */
async function processSlackMention(
  supabase: ReturnType<typeof createAdminClient>,
  payload: SlackEventCallback
): Promise<IngestPipelineResult> {
  const { team_id, event } = payload

  // Find active Slack connection for this team
  const { data: connections, error: connError } = await supabase
    .from('slack_connections')
    .select('user_id, slack_user_id, access_token')
    .eq('team_id', team_id)
    .is('revoked_at', null)

  if (connError || !connections || connections.length === 0) {
    return {
      created: false,
      score: 0,
      decision: 'dropped_low_actionability',
      error: connError?.message || 'no_active_connection',
    }
  }

  // Process for each connection (user) that might be mentioned
  for (const connection of connections) {
    const { user_id, slack_user_id, access_token } = connection

    // Normalize the Slack payload
    const normalized = normalizeSlackPayload(
      payload as unknown as Parameters<typeof normalizeSlackPayload>[0],
      { currentSlackUserId: slack_user_id }
    )

    if (!normalized) {
      continue // User not mentioned in this message
    }

    // Fetch permalink if not present
    if (!normalized.permalink && access_token) {
      const permalink = await ensurePermalink(
        access_token,
        normalized.channel_id,
        normalized.message_ts
      )
      if (permalink) {
        normalized.permalink = permalink
      }
    }

    // Get user display name for the message author
    if (access_token && event.user && !normalized.user_name) {
      try {
        const userInfo = await fetchSlackUser(access_token, event.user)
        if (userInfo?.display_name) {
          normalized.user_name = userInfo.display_name
        }
      } catch {
        // Continue without user name
      }
    }

    // Validate message is ready for processing
    if (!isValidForProcessing(normalized)) {
      continue
    }

    const sourceId = generateSourceId(normalized)

    // Step 1: Compute heuristic actionability score
    const actionabilityResult = computeActionabilityScore(normalized)
    const score = actionabilityResult.score

    // Step 2: Check if we should call the LLM
    if (!shouldCallLLM(score)) {
      // Low actionability - drop without LLM call
      await logIngestDecision(
        supabase,
        user_id,
        sourceId,
        score,
        false,
        undefined,
        undefined,
        'dropped_low_actionability'
      )

      return {
        created: false,
        score,
        decision: 'dropped_low_actionability',
      }
    }

    // Step 3: Call LLM for classification
    const classificationResult = await classifySlackMention(normalized)

    let classification = classificationResult.classification
    let usedFallback = false

    // Handle LLM failure with fallback
    if (!classificationResult.success || !classification) {
      const fallback = createFallbackFromMessage(normalized)
      classification = {
        is_task: true,
        confidence: 0.5,
        title: fallback.title,
        description: fallback.description,
        why: fallback.llm_why,
      }
      usedFallback = true
    }

    // Step 4: Check if LLM says it's a task
    if (!classification.is_task) {
      await logIngestDecision(
        supabase,
        user_id,
        sourceId,
        score,
        true,
        false,
        classification.confidence,
        'dropped_low_confidence'
      )

      return {
        created: false,
        score,
        decision: 'dropped_low_confidence',
        is_task: false,
        confidence: classification.confidence,
        llm_why: classification.why,
      }
    }

    // Step 5: Check confidence threshold
    const requiredConfidence = getRequiredConfidence(score)
    if (classification.confidence < requiredConfidence) {
      await logIngestDecision(
        supabase,
        user_id,
        sourceId,
        score,
        true,
        true,
        classification.confidence,
        'dropped_low_confidence'
      )

      return {
        created: false,
        score,
        decision: 'dropped_low_confidence',
        is_task: true,
        confidence: classification.confidence,
        llm_why: classification.why,
      }
    }

    // Step 6: Create task
    const taskInput = buildTaskInput(user_id, normalized, classification)
    const createResult = await createTaskFromSource(supabase, taskInput)

    if (createResult.deduped) {
      await logIngestDecision(
        supabase,
        user_id,
        sourceId,
        score,
        true,
        true,
        classification.confidence,
        'deduped'
      )

      return {
        created: false,
        score,
        decision: 'deduped',
        is_task: true,
        confidence: classification.confidence,
        llm_why: classification.why,
      }
    }

    if (!createResult.success) {
      return {
        created: false,
        score,
        decision: usedFallback ? 'llm_failed_validation' : 'dropped_low_confidence',
        is_task: true,
        confidence: classification.confidence,
        llm_why: classification.why,
        error: createResult.error,
      }
    }

    // Success!
    await logIngestDecision(
      supabase,
      user_id,
      sourceId,
      score,
      true,
      true,
      classification.confidence,
      usedFallback ? 'llm_failed_validation' : 'created'
    )

    return {
      created: true,
      task_id: createResult.taskId,
      score,
      decision: usedFallback ? 'llm_failed_validation' : 'created',
      is_task: true,
      confidence: classification.confidence,
      llm_why: classification.why,
    }
  }

  // No matching connection found for mention
  return {
    created: false,
    score: 0,
    decision: 'dropped_low_actionability',
    error: 'no_matching_user',
  }
}

/**
 * Slack Mention Ingestion API endpoint
 *
 * Processes Slack mentions through a heuristic + LLM pipeline:
 * 1. Normalize payload to SlackIngestMessage
 * 2. Ensure permalink exists
 * 3. Compute heuristic actionability score
 * 4. Conditionally call LLM for classification
 * 5. Conditionally insert task with dedupe
 *
 * Security:
 * - Verifies Slack request signature
 * - Feature flag check
 * - Idempotent via unique constraint on (user_id, source_type, source_id)
 */
export async function POST(request: Request) {
  // Check feature flag
  if (process.env.SLACK_FEATURE_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Slack integration disabled' }, { status: 404 })
  }

  // Get signing secret
  const signingSecret = process.env.SLACK_SIGNING_SECRET
  if (!signingSecret) {
    console.error('SLACK_SIGNING_SECRET not configured')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  // Get headers and body for verification
  const { signature, timestamp } = getSlackHeaders(request.headers)

  if (!signature || !timestamp) {
    return NextResponse.json({ error: 'Missing Slack headers' }, { status: 401 })
  }

  // Clone request to read body (request can only be read once)
  const body = await request.text()

  // Verify signature
  const isValid = verifySlackSignature(signingSecret, signature, timestamp, body)
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Parse payload
  let payload: SlackEventCallback
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Handle URL verification challenge
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge })
  }

  // Only process event callbacks
  if (payload.type !== 'event_callback') {
    return NextResponse.json({ ok: true, skipped: 'not_event_callback' })
  }

  // Only process message events
  if (payload.event?.type !== 'message') {
    return NextResponse.json({ ok: true, skipped: 'not_message_event' })
  }

  try {
    const supabase = createAdminClient()
    const result = await processSlackMention(supabase, payload)

    return NextResponse.json({
      created: result.created,
      score: result.score,
      is_task: result.is_task,
      confidence: result.confidence,
      decision: result.decision,
    })
  } catch (error) {
    console.error('Error processing Slack mention:', error)
    // Still return 200 to prevent Slack retries for server errors
    return NextResponse.json({
      created: false,
      score: 0,
      decision: 'dropped_low_actionability',
      error: 'Processing error',
    })
  }
}

// Reject other methods
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
