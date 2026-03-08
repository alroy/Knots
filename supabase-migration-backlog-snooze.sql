-- Add snoozed_until column to backlog table for snooze-to-tasks feature
ALTER TABLE backlog ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;
