/**
 * Types for Slack Mention-Only Task Ingestion Pipeline
 *
 * This module defines the data contracts for:
 * - Normalized Slack message input (SlackIngestMessage)
 * - LLM classification output (LLMTaskClassification)
 * - Pipeline processing result (IngestPipelineResult)
 */

import { z } from 'zod'

/**
 * Normalized input object used by heuristics and LLM
 * Created from raw Slack event payload
 */
export interface SlackIngestMessage {
  team_id: string
  channel_id: string
  channel_name?: string
  message_ts: string
  thread_ts?: string
  user_id: string // Author of the Slack message
  user_name?: string
  text: string
  permalink: string // Must exist by the time we score/call LLM
  mentioned_user_ids: string[] // Include the current user id
  trigger: 'mention' | 'dm_poll' // Source of ingestion
  ingested_at: string // ISO timestamp
  // Optional MVP+ fields
  thread_parent_text?: string // Fetch parent message if thread_ts exists
}

/**
 * Task types the LLM can classify
 */
export type LLMTaskType =
  | 'follow_up'
  | 'bug'
  | 'decision'
  | 'research'
  | 'admin'
  | 'misc'

/**
 * LLM output JSON schema - what the LLM returns
 */
export interface LLMTaskClassification {
  is_task: boolean
  confidence: number // 0..1
  title: string // Required when is_task=true, 3..80 chars
  description: string // May be empty
  why: string // Short reason, for logs
  task_type?: LLMTaskType
  due_hint?: string // Free text, do not parse dates in MVP
  assignees_hint?: string | string[]
}

/**
 * Zod schema for LLM output validation
 */
export const LLMTaskClassificationSchema = z.object({
  is_task: z.boolean(),
  confidence: z.number().min(0).max(1),
  title: z.string(),
  description: z.string(),
  why: z.string(),
  task_type: z
    .enum(['follow_up', 'bug', 'decision', 'research', 'admin', 'misc'])
    .optional(),
  due_hint: z.string().optional(),
  assignees_hint: z.union([z.string(), z.array(z.string())]).optional(),
})

/**
 * Validated LLM response (after Zod parsing)
 */
export type ValidatedLLMResponse = z.infer<typeof LLMTaskClassificationSchema>

/**
 * Decision outcome for the pipeline
 */
export type IngestDecision =
  | 'created'
  | 'dropped_low_actionability'
  | 'dropped_low_confidence'
  | 'deduped'
  | 'llm_failed_validation'

/**
 * Result of the ingestion pipeline
 */
export interface IngestPipelineResult {
  created: boolean
  task_id?: string
  score: number // Actionability score
  decision: IngestDecision
  is_task?: boolean // From LLM
  confidence?: number // From LLM
  llm_why?: string // Reasoning from LLM
  error?: string
}

/**
 * Logging data for each ingested message
 * Required for threshold tuning
 */
export interface IngestLogEntry {
  source_id: string // team_id:channel_id:message_ts
  actionability_score: number
  llm_called: boolean
  llm_is_task?: boolean
  llm_confidence?: number
  decision: IngestDecision
  timestamp: string
}

/**
 * Task creation input for Supabase
 */
export interface TaskFromSourceInput {
  user_id: string
  title: string
  description: string
  source_type: 'slack' | 'granola'
  source_id: string // team_id:channel_id:message_ts or granola:<meeting_id>:<index>
  source_url: string // Slack permalink or Granola meeting URL
  raw_source_text?: string // Controlled by env flag
  llm_confidence?: number
  llm_why?: string
  ingest_trigger: 'mention' | 'dm' | 'dm_poll' | 'zapier'
  goal_id?: string // FK to goals table for task-to-goal linking
}

/**
 * Thresholds for decision making
 * Extracted as constants for easy tuning
 */
export const INGEST_THRESHOLDS = {
  // Below this score, do not call LLM
  LOW_ACTIONABILITY: 0.35,
  // Above this score, use lower confidence threshold
  HIGH_ACTIONABILITY: 0.60,
  // Required confidence when score is in mid-range (0.35-0.60)
  MID_RANGE_CONFIDENCE: 0.75,
  // Required confidence when score is high (>=0.60)
  HIGH_RANGE_CONFIDENCE: 0.65,
} as const
