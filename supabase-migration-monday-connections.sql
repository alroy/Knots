-- Migration: monday_connections table for per-user Monday.com board connections
-- This table stores each user's Monday.com API credentials and board ID,
-- replacing the single-user MONDAY_API_KEY and AUTH_USER_ID env vars.

-- Create the monday_connections table
CREATE TABLE IF NOT EXISTS monday_connections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key text NOT NULL,
  board_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE monday_connections ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access their own connection
CREATE POLICY "Users can view own monday connection"
  ON monday_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own monday connection"
  ON monday_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own monday connection"
  ON monday_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own monday connection"
  ON monday_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Enable realtime (optional, for instant UI updates across tabs)
ALTER PUBLICATION supabase_realtime ADD TABLE monday_connections;
