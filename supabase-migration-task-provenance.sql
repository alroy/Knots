-- Task Provenance Migration
-- Run this in Supabase SQL Editor to add source tracking columns for Slack ingestion
--
-- This migration adds columns for:
-- - Source tracking (source_type, source_id, source_url)
-- - LLM classification metadata (llm_confidence, llm_why)
-- - Raw source text storage (optional, controlled by env flag)
-- - Deduplication via unique constraint

-- ============================================
-- Add provenance columns to tasks table
-- ============================================

-- Source type (e.g., 'slack')
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_type TEXT;

-- Source ID for deduplication (e.g., 'team_id:channel_id:message_ts')
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_id TEXT;

-- Source URL (e.g., Slack permalink)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Raw source text (optional storage, controlled by STORE_RAW_SLACK_TEXT env)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS raw_source_text TEXT;

-- LLM confidence score (0-1)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS llm_confidence REAL;

-- LLM reasoning for logs and debugging
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS llm_why TEXT;

-- Ingest trigger (e.g., 'mention', 'dm' for future expansion)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ingest_trigger TEXT;

-- ============================================
-- Create unique constraint for deduplication
-- ============================================

-- Unique constraint: (user_id, source_type, source_id) where source_type is not null
-- This prevents duplicate tasks from the same Slack message
CREATE UNIQUE INDEX IF NOT EXISTS tasks_source_dedupe_idx
  ON tasks(user_id, source_type, source_id)
  WHERE source_type IS NOT NULL;

-- ============================================
-- Add indexes for query performance
-- ============================================

-- Index for finding tasks by source type
CREATE INDEX IF NOT EXISTS tasks_source_type_idx ON tasks(source_type) WHERE source_type IS NOT NULL;

-- Index for finding tasks by ingest trigger
CREATE INDEX IF NOT EXISTS tasks_ingest_trigger_idx ON tasks(ingest_trigger) WHERE ingest_trigger IS NOT NULL;

-- ============================================
-- Verification query (run after migration)
-- ============================================
-- Check new columns exist:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'tasks'
-- AND column_name IN ('source_type', 'source_id', 'source_url', 'raw_source_text', 'llm_confidence', 'llm_why', 'ingest_trigger');
--
-- Check unique constraint exists:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'tasks' AND indexname = 'tasks_source_dedupe_idx';
