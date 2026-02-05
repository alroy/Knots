-- Source Author Name Migration
-- Run this in Supabase SQL Editor to add the source_author_name column
--
-- This migration adds the author name field for Slack-created tasks,
-- allowing the UI to display "Nathan Cohen via Slack" instead of just "Slack"

-- Add source_author_name column to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_author_name TEXT;

-- ============================================
-- Verification query (run after migration)
-- ============================================
-- Check new column exists:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'tasks'
-- AND column_name = 'source_author_name';
