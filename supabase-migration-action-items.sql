-- Migration: action_items table
-- This table is populated by an external Cowork scheduled task that scans
-- Slack mentions and Granola meeting transcripts twice a day.
-- The app reads from this table and can update status (done/dismissed).

CREATE TABLE action_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
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

-- Enable realtime for action_items
ALTER PUBLICATION supabase_realtime ADD TABLE action_items;

-- Enable RLS
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all action items
CREATE POLICY "Authenticated users can read action_items"
  ON action_items FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to update status
CREATE POLICY "Authenticated users can update action_items status"
  ON action_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
