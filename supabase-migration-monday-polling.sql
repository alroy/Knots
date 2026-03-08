-- Migration: Add last_poll_at to monday_connections for cron-based polling
-- Run this in your Supabase SQL Editor

ALTER TABLE monday_connections
ADD COLUMN IF NOT EXISTS last_poll_at TIMESTAMPTZ;

COMMENT ON COLUMN monday_connections.last_poll_at IS 'Watermark for cron-based activity log polling';
