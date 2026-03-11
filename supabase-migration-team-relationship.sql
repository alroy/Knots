-- Run this in Supabase SQL Editor to add 'team' as a valid relationship type for people
-- This updates the CHECK constraint to allow 'team' in addition to 'manager', 'report', 'stakeholder'

ALTER TABLE people DROP CONSTRAINT IF EXISTS people_relationship_check;
ALTER TABLE people ADD CONSTRAINT people_relationship_check
  CHECK (relationship IN ('manager', 'team', 'report', 'stakeholder'));
