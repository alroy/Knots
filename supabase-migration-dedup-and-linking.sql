-- Dedup & Linking Migration
-- Adds goal_id FK on tasks for task-to-goal linking

-- ============================================
-- Add goal_id to tasks table
-- ============================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tasks_goal_id_idx ON tasks(goal_id) WHERE goal_id IS NOT NULL;

-- ============================================
-- Verification
-- ============================================
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'tasks' AND column_name = 'goal_id';
