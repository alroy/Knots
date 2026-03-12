-- Migration: Create action_items table
-- This table stores action items synced from a Monday.com board.
-- An external process (Cowork scheduled task) scans Slack mentions and Granola
-- meeting transcripts and writes action items to Monday.com. The app syncs
-- those items into this table.

CREATE TABLE action_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  scan_timestamp timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('slack', 'granola')),
  source_channel text,
  message_from text,
  message_link text,
  message_timestamp timestamptz,
  action_item text NOT NULL,
  status text DEFAULT 'new' CHECK (status IN ('new', 'done', 'dismissed')),
  raw_context text
);

CREATE INDEX idx_action_items_status ON action_items(status);
CREATE INDEX idx_action_items_scan ON action_items(scan_timestamp);
CREATE INDEX idx_action_items_source ON action_items(source);
CREATE INDEX idx_action_items_message_link ON action_items(message_link);
CREATE INDEX idx_action_items_user_id ON action_items(user_id);

-- Enable RLS
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only see/modify their own action items
CREATE POLICY "Users can view their own action items"
  ON action_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own action items"
  ON action_items FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role (admin client) can insert rows during sync
CREATE POLICY "Service role can insert action items"
  ON action_items FOR INSERT
  WITH CHECK (true);

-- Enable realtime for cross-tab sync
ALTER TABLE action_items REPLICA IDENTITY FULL;
