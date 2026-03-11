-- Add avatar_url column to user_profile for profile image uploads
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';
