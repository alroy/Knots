-- Migration: Monday.com dedup and sync state tracking
-- Adds monday_item_id column for reliable deduplication,
-- and a sync_state table to track when each sync last ran.
-- Safe to run multiple times (uses IF NOT EXISTS).

-- 1. Add monday_item_id to action_items for dedup by Monday item ID
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS monday_item_id text;

-- 2. Unique index: prevents duplicate inserts for the same Monday item per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_action_items_monday_dedup
  ON action_items(user_id, monday_item_id) WHERE monday_item_id IS NOT NULL;

-- 3. Sync state table: tracks when each sync type last completed
CREATE TABLE IF NOT EXISTS sync_state (
  id serial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  sync_key text NOT NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, sync_key)
);

ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage sync_state" ON sync_state;
CREATE POLICY "Service role can manage sync_state"
  ON sync_state FOR ALL
  USING (true)
  WITH CHECK (true);
