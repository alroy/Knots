/**
 * Slack Mention Ingestion Pipeline
 *
 * Re-exports all modules for the mention-only task creation pipeline.
 */

// Types (use export type for isolatedModules compatibility)
export type {
  SlackIngestMessage,
  LLMTaskClassification,
  ValidatedLLMResponse,
  IngestDecision,
  IngestPipelineResult,
  IngestLogEntry,
  TaskFromSourceInput,
  LLMTaskType,
} from './types'

// Values from types
export { LLMTaskClassificationSchema, INGEST_THRESHOLDS } from './types'

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

// Actionability scoring (types)
export type { ActionabilityResult } from './actionability'

// Actionability scoring (values)
export {
  computeActionabilityScore,
  shouldCallLLM,
  getRequiredConfidence,
} from './actionability'

// LLM classification (types)
export type { ClassificationResult, FallbackResult, ForwardedTaskShape, DMTaskShape } from './classify'

// LLM classification (values)
export {
  classifySlackMention,
  classifyWithFallback,
  createFallbackFromMessage,
  shapeForwardedMessage,
  createForwardedFallback,
  shapeDMMessage,
  createDMFallback,
} from './classify'

// Task creation (types)
export type { CreateTaskResult } from './create-task'

// Task creation (values)
export {
  createTaskFromSource,
  buildTaskInput,
  taskExistsForSource,
} from './create-task'
