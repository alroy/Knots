-- Chief of Staff Migration (idempotent / safe to re-run)
-- Run this in Supabase SQL Editor to add goals, people, backlog, and user_profile tables

-- ============================================
-- Goals table
-- ============================================

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'at_risk', 'archived')),
  metrics TEXT DEFAULT '',
  deadline DATE,
  risks TEXT DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS goals_user_position_idx ON goals(user_id, position);
CREATE INDEX IF NOT EXISTS goals_user_status_idx ON goals(user_id, status);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own goals" ON goals;
CREATE POLICY "Users can view own goals" ON goals FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own goals" ON goals;
CREATE POLICY "Users can create own goals" ON goals FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own goals" ON goals;
CREATE POLICY "Users can update own goals" ON goals FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own goals" ON goals;
CREATE POLICY "Users can delete own goals" ON goals FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE goals REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION shift_goal_positions()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.position = 0 THEN
    UPDATE goals SET position = position + 1
    WHERE user_id = NEW.user_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS goals_shift_positions ON goals;
CREATE TRIGGER goals_shift_positions
  AFTER INSERT ON goals FOR EACH ROW EXECUTE FUNCTION shift_goal_positions();

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

CREATE INDEX IF NOT EXISTS people_user_relationship_idx ON people(user_id, relationship);
CREATE INDEX IF NOT EXISTS people_user_position_idx ON people(user_id, position);

ALTER TABLE people ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own people" ON people;
CREATE POLICY "Users can view own people" ON people FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own people" ON people;
CREATE POLICY "Users can create own people" ON people FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own people" ON people;
CREATE POLICY "Users can update own people" ON people FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own people" ON people;
CREATE POLICY "Users can delete own people" ON people FOR DELETE USING (auth.uid() = user_id);

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

CREATE INDEX IF NOT EXISTS backlog_user_position_idx ON backlog(user_id, position);
CREATE INDEX IF NOT EXISTS backlog_user_category_idx ON backlog(user_id, category);
CREATE INDEX IF NOT EXISTS backlog_user_status_idx ON backlog(user_id, status);

ALTER TABLE backlog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own backlog" ON backlog;
CREATE POLICY "Users can view own backlog" ON backlog FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own backlog" ON backlog;
CREATE POLICY "Users can create own backlog" ON backlog FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own backlog" ON backlog;
CREATE POLICY "Users can update own backlog" ON backlog FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own backlog" ON backlog;
CREATE POLICY "Users can delete own backlog" ON backlog FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE backlog REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION shift_backlog_positions()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.position = 0 THEN
    UPDATE backlog SET position = position + 1
    WHERE user_id = NEW.user_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS backlog_shift_positions ON backlog;
CREATE TRIGGER backlog_shift_positions
  AFTER INSERT ON backlog FOR EACH ROW EXECUTE FUNCTION shift_backlog_positions();

-- ============================================
-- User Profile table
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

ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON user_profile;
CREATE POLICY "Users can view own profile" ON user_profile FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own profile" ON user_profile;
CREATE POLICY "Users can create own profile" ON user_profile FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON user_profile;
CREATE POLICY "Users can update own profile" ON user_profile FOR UPDATE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_user_profile_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_profile_updated_at ON user_profile;
CREATE TRIGGER user_profile_updated_at
  BEFORE UPDATE ON user_profile FOR EACH ROW EXECUTE FUNCTION update_user_profile_timestamp();

ALTER TABLE user_profile REPLICA IDENTITY FULL;

-- ============================================
-- Enable realtime publication for new tables
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'goals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE goals;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'people'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE people;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'backlog'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE backlog;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_profile'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE user_profile;
  END IF;
END $$;
