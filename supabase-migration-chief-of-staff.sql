-- Chief of Staff Migration
-- Run this in Supabase SQL Editor to add goals, people, backlog, and user_profile tables
--
-- This migration adds:
-- - goals: Priority goals with success criteria, metrics, deadlines
-- - people: 1-1 contact profiles (manager, reports, stakeholders)
-- - backlog: Strategic items (questions, decisions, process improvements, ideas)
-- - user_profile: AI interaction preferences and role context (CLAUDE.md equivalent)

-- ============================================
-- Goals table
-- ============================================

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 2, -- 1=P0, 2=P1, 3=P2
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'at_risk')),
  metrics TEXT DEFAULT '',
  deadline DATE,
  risks TEXT DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS goals_user_position_idx ON goals(user_id, position);
CREATE INDEX IF NOT EXISTS goals_user_status_idx ON goals(user_id, status);

-- RLS
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own goals" ON goals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own goals" ON goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own goals" ON goals
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own goals" ON goals
  FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime
ALTER TABLE goals REPLICA IDENTITY FULL;

-- Position trigger: new goals at position 0, shift existing
CREATE OR REPLACE FUNCTION shift_goal_positions()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.position = 0 THEN
    UPDATE goals
    SET position = position + 1
    WHERE user_id = NEW.user_id
      AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER goals_shift_positions
  AFTER INSERT ON goals
  FOR EACH ROW
  EXECUTE FUNCTION shift_goal_positions();

-- ============================================
-- People table
-- ============================================

CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT DEFAULT '',
  relationship TEXT NOT NULL DEFAULT 'stakeholder' CHECK (relationship IN ('manager', 'report', 'stakeholder')),
  context TEXT DEFAULT '',
  strengths TEXT DEFAULT '',
  growth_areas TEXT DEFAULT '',
  motivations TEXT DEFAULT '',
  communication_style TEXT DEFAULT '',
  current_focus TEXT DEFAULT '',
  risks_concerns TEXT DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS people_user_relationship_idx ON people(user_id, relationship);
CREATE INDEX IF NOT EXISTS people_user_position_idx ON people(user_id, position);

-- RLS
ALTER TABLE people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own people" ON people
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own people" ON people
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own people" ON people
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own people" ON people
  FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime
ALTER TABLE people REPLICA IDENTITY FULL;

-- ============================================
-- Backlog table
-- ============================================

CREATE TABLE IF NOT EXISTS backlog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'action' CHECK (category IN ('question', 'decision', 'process', 'idea', 'action')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS backlog_user_position_idx ON backlog(user_id, position);
CREATE INDEX IF NOT EXISTS backlog_user_category_idx ON backlog(user_id, category);
CREATE INDEX IF NOT EXISTS backlog_user_status_idx ON backlog(user_id, status);

-- RLS
ALTER TABLE backlog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own backlog" ON backlog
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own backlog" ON backlog
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own backlog" ON backlog
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own backlog" ON backlog
  FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime
ALTER TABLE backlog REPLICA IDENTITY FULL;

-- Position trigger: new backlog items at position 0, shift existing
CREATE OR REPLACE FUNCTION shift_backlog_positions()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.position = 0 THEN
    UPDATE backlog
    SET position = position + 1
    WHERE user_id = NEW.user_id
      AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER backlog_shift_positions
  AFTER INSERT ON backlog
  FOR EACH ROW
  EXECUTE FUNCTION shift_backlog_positions();

-- ============================================
-- User Profile table (CLAUDE.md equivalent)
-- ============================================

CREATE TABLE IF NOT EXISTS user_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT DEFAULT '',
  role_title TEXT DEFAULT '',
  role_description TEXT DEFAULT '',
  communication_style TEXT DEFAULT '',
  thinking_style TEXT DEFAULT '',
  blind_spots TEXT DEFAULT '',
  energy_drains TEXT DEFAULT '',
  ai_instructions TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_profile_user_id_unique UNIQUE (user_id)
);

-- RLS
ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON user_profile
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own profile" ON user_profile
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON user_profile
  FOR UPDATE USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_user_profile_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_profile_updated_at
  BEFORE UPDATE ON user_profile
  FOR EACH ROW
  EXECUTE FUNCTION update_user_profile_timestamp();

-- Enable realtime
ALTER TABLE user_profile REPLICA IDENTITY FULL;

-- ============================================
-- Enable realtime publication for new tables
-- ============================================

-- Add tables to the supabase_realtime publication
-- (Supabase requires this for real-time subscriptions)
ALTER PUBLICATION supabase_realtime ADD TABLE goals;
ALTER PUBLICATION supabase_realtime ADD TABLE people;
ALTER PUBLICATION supabase_realtime ADD TABLE backlog;
ALTER PUBLICATION supabase_realtime ADD TABLE user_profile;

-- ============================================
-- Verification query (run after migration)
-- ============================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('goals', 'people', 'backlog', 'user_profile');
