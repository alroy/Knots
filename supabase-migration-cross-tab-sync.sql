-- Migration to fix cross-tab sync for reorder and delete operations
-- Run this in your Supabase SQL Editor

-- 1. Add position column to tasks table for persistent ordering
-- Default to 0, will be set properly when tasks are loaded/created
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- 2. Create index on position for efficient ordering queries
CREATE INDEX IF NOT EXISTS tasks_position_idx ON tasks(user_id, position);

-- 3. Set REPLICA IDENTITY to FULL for the tasks table
-- This ensures DELETE events include all columns (including user_id)
-- which is required for the Realtime subscription filter to work correctly
ALTER TABLE tasks REPLICA IDENTITY FULL;

-- 4. Initialize positions for existing tasks based on created_at order
-- This ensures existing tasks have meaningful position values
WITH ranked_tasks AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) - 1 as new_position
  FROM tasks
)
UPDATE tasks
SET position = ranked_tasks.new_position
FROM ranked_tasks
WHERE tasks.id = ranked_tasks.id;

-- 5. Create a function to auto-set position for new tasks
-- New tasks get position 0 (top of list) and shift others down
CREATE OR REPLACE FUNCTION set_task_position()
RETURNS TRIGGER AS $$
BEGIN
  -- If position is not explicitly set, put at top (position 0)
  IF NEW.position IS NULL OR NEW.position = 0 THEN
    -- Increment position of all existing tasks for this user
    UPDATE tasks
    SET position = position + 1
    WHERE user_id = NEW.user_id AND id != NEW.id;

    NEW.position = 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create trigger for auto-setting position on insert
DROP TRIGGER IF EXISTS set_task_position_trigger ON tasks;
CREATE TRIGGER set_task_position_trigger
BEFORE INSERT ON tasks
FOR EACH ROW
EXECUTE FUNCTION set_task_position();

-- Verification queries (optional, run to check migration success):
-- SELECT id, title, position, created_at FROM tasks ORDER BY user_id, position;
-- SELECT relreplident FROM pg_class WHERE relname = 'tasks'; -- Should return 'f' for FULL
