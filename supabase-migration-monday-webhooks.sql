-- Monday.com Webhooks Migration
-- Run this in Supabase SQL Editor to track registered webhooks

-- ============================================
-- Table: monday_webhooks
-- Tracks webhook subscriptions registered on Monday.com boards
-- ============================================
CREATE TABLE IF NOT EXISTS monday_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES monday_connections(id) ON DELETE CASCADE,
  board_id TEXT NOT NULL,
  webhook_id TEXT NOT NULL,         -- Monday.com's webhook ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(connection_id, board_id)
);

CREATE INDEX IF NOT EXISTS monday_webhooks_connection_idx
  ON monday_webhooks(connection_id);

-- Enable RLS
ALTER TABLE monday_webhooks ENABLE ROW LEVEL SECURITY;

-- Service role only (webhooks are managed server-side)
CREATE POLICY "Service role full access to monday webhooks" ON monday_webhooks
  FOR ALL USING (auth.role() = 'service_role');
