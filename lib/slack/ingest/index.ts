/**
 * Slack Mention Ingestion Pipeline
 *
 * Re-exports all modules for the mention-only task creation pipeline.
 */

// Types
export {
  SlackIngestMessage,
  LLMTaskClassification,
  LLMTaskClassificationSchema,
  ValidatedLLMResponse,
  IngestDecision,
  IngestPipelineResult,
  IngestLogEntry,
  TaskFromSourceInput,
  INGEST_THRESHOLDS,
  LLMTaskType,
} from './types'

// Normalization
export {
  normalizeSlackPayload,
  extractMentionedUserIds,
  generateSourceId,
  isValidForProcessing,
} from './normalize'

// Permalink utilities
export {
  fetchSlackPermalink,
  constructPermalinkPath,
  constructFullPermalink,
  ensurePermalink,
} from './permalink'

// Actionability scoring
export {
  computeActionabilityScore,
  shouldCallLLM,
  getRequiredConfidence,
  ActionabilityResult,
} from './actionability'

// LLM classification
export {
  classifySlackMention,
  classifyWithFallback,
  createFallbackFromMessage,
  ClassificationResult,
  FallbackResult,
} from './classify'

// Task creation
export {
  createTaskFromSource,
  buildTaskInput,
  taskExistsForSource,
  CreateTaskResult,
} from './create-task'
