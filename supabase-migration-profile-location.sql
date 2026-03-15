-- Migration: Add location column to user_profile
-- Run this in Supabase SQL Editor

ALTER TABLE user_profile
  ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '';
