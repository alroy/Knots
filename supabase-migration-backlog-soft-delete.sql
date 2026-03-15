-- Add soft-delete support to backlog table.
-- Resolved items that are "deleted" by the user set deleted_at instead of
-- being removed, so analytics can still count them as completed.

ALTER TABLE backlog ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Index for efficient filtering of non-deleted items
CREATE INDEX IF NOT EXISTS idx_backlog_deleted_at ON backlog (deleted_at) WHERE deleted_at IS NULL;
