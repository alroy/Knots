/**
 * Task Creation from External Sources
 *
 * Handles creating tasks in Supabase with source provenance tracking
 * and deduplication based on source_id.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { TaskFromSourceInput, SlackIngestMessage, LLMTaskClassification } from './types'
import { generateSourceId } from './normalize'

/**
 * Result of task creation attempt
 */
export interface CreateTaskResult {
  success: boolean
  taskId?: string
  deduped: boolean
  error?: string
}

/**
 * Check if storing raw source text is enabled
 */
function shouldStoreRawText(): boolean {
  return process.env.STORE_RAW_SLACK_TEXT === 'true'
}

/**
 * Build task input from Slack message and LLM classification
 */
export function buildTaskInput(
  userId: string,
  message: SlackIngestMessage,
  classification: LLMTaskClassification
): TaskFromSourceInput {
  // Always append permalink to description
  let description = classification.description || ''
  if (message.permalink) {
    if (description) {
      description += '\n\n'
    }
    description += `Source: ${message.permalink}`
  }

  return {
    user_id: userId,
    title: classification.title,
    description,
    source_type: 'slack',
    source_id: generateSourceId(message),
    source_url: message.permalink,
    source_author_name: message.user_name,
    raw_source_text: shouldStoreRawText() ? message.text : undefined,
    llm_confidence: classification.confidence,
    llm_why: classification.why,
    ingest_trigger: 'mention',
  }
}

/**
 * Create a task from an external source with deduplication
 *
 * Uses the unique constraint on (user_id, source_type, source_id) for dedupe.
 * On conflict, returns deduped=true without creating a new task.
 *
 * @param supabase - Supabase admin client (bypasses RLS)
 * @param input - Task creation input
 * @returns Creation result
 */
export async function createTaskFromSource(
  supabase: SupabaseClient,
  input: TaskFromSourceInput
): Promise<CreateTaskResult> {
  try {
    // Build the task row
    const taskRow = {
      title: input.title,
      description: input.description,
      status: 'active',
      user_id: input.user_id,
      position: 0, // New tasks at top
      source_type: input.source_type,
      source_id: input.source_id,
      source_url: input.source_url,
      source_author_name: input.source_author_name,
      raw_source_text: input.raw_source_text,
      llm_confidence: input.llm_confidence,
      llm_why: input.llm_why,
      ingest_trigger: input.ingest_trigger,
    }

    // Insert with ON CONFLICT handling
    // The unique constraint (user_id, source_type, source_id) handles dedupe
    const { data, error } = await supabase
      .from('tasks')
      .insert(taskRow)
      .select('id')
      .single()

    if (error) {
      // Check for unique constraint violation (dedupe)
      if (error.code === '23505') {
        return {
          success: true,
          deduped: true,
        }
      }

      return {
        success: false,
        deduped: false,
        error: error.message,
      }
    }

    return {
      success: true,
      taskId: data.id,
      deduped: false,
    }
  } catch (error) {
    return {
      success: false,
      deduped: false,
      error: `Unexpected error: ${(error as Error).message}`,
    }
  }
}

/**
 * Check if a task already exists for this source
 *
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param sourceType - Source type (e.g., 'slack')
 * @param sourceId - Source ID
 * @returns true if task exists
 */
export async function taskExistsForSource(
  supabase: SupabaseClient,
  userId: string,
  sourceType: string,
  sourceId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id')
    .eq('user_id', userId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .maybeSingle()

  if (error) {
    console.error('Error checking for existing task:', error)
    return false
  }

  return data !== null
}
