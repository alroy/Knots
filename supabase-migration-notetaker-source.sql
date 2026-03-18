-- Migration: Add 'notetaker' to action_items.source CHECK constraint
-- The source column may have a CHECK constraint limiting values to
-- ('slack', 'granola', 'gmail'). This migration drops that constraint
-- (if it exists) and recreates it with 'notetaker' included.
-- Safe to run multiple times.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT c.conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
  WHERE c.conrelid = 'action_items'::regclass
    AND c.contype = 'c'
    AND a.attname = 'source';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE action_items DROP CONSTRAINT ' || constraint_name;
  END IF;
END $$;

ALTER TABLE action_items ADD CONSTRAINT action_items_source_check
  CHECK (source IN ('slack', 'granola', 'gmail', 'notetaker'));
