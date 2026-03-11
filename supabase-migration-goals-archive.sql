-- Migration: Add 'archived' to goals status CHECK constraint
-- Run this in Supabase SQL Editor to allow archiving goals

ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_status_check;
ALTER TABLE goals ADD CONSTRAINT goals_status_check CHECK (status IN ('active', 'completed', 'at_risk', 'archived'));
