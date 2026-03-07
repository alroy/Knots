-- Monday.com Integration Migration
-- Run this in Supabase SQL Editor to enable Monday.com integration

-- ============================================
-- Table: monday_connections
-- Stores Monday.com OAuth tokens linked to Knots users
-- ============================================
CREATE TABLE IF NOT EXISTS monday_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,          -- Monday.com account ID
  monday_user_id TEXT NOT NULL,      -- User's Monday user ID
  access_token TEXT NOT NULL,        -- OAuth token
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  UNIQUE(user_id, account_id)
);

-- Index for looking up active connections
CREATE INDEX IF NOT EXISTS monday_connections_active_idx
  ON monday_connections(account_id, monday_user_id) WHERE revoked_at IS NULL;

-- Enable RLS
ALTER TABLE monday_connections ENABLE ROW LEVEL SECURITY;

-- Users can view their own connections
CREATE POLICY "Users can view own monday connections" ON monday_connections
  FOR SELECT USING (auth.uid() = user_id);

-- Users can soft-delete (revoke) their own connections
CREATE POLICY "Users can update own monday connections" ON monday_connections
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role can do everything (for OAuth callback and webhook processing)
CREATE POLICY "Service role full access to monday connections" ON monday_connections
  FOR ALL USING (auth.role() = 'service_role');
