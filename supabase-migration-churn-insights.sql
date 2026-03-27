-- Migration: Create churn_insights table for anonymous exit questionnaire data
-- This table stores anonymous churn data when users delete their accounts.
-- No user_id column by design — data is not linked to any user.

CREATE TABLE IF NOT EXISTS churn_insights (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reason text,
  recommend_score smallint,
  final_note text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS (service role key bypasses it; no anon access needed)
ALTER TABLE churn_insights ENABLE ROW LEVEL SECURITY;
