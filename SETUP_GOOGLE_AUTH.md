# Google OAuth Setup Guide for Knots

This guide will help you set up Google OAuth authentication for your Knots app with email restriction to `gil.alroy@gmail.com`.

## Step 1: Configure Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google+ API" and enable it
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Web application"
   - Add authorized redirect URIs:
     - For production: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
     - For local development: `http://localhost:54321/auth/v1/callback`
   - Save your **Client ID** and **Client Secret**

## Step 2: Configure Supabase Authentication

1. Go to your [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Navigate to **Authentication** > **Providers**
4. Find **Google** in the list and click to configure
5. Enable the Google provider
6. Enter your Google OAuth credentials:
   - **Client ID**: (from Step 1)
   - **Client Secret**: (from Step 1)
7. Click **Save**

## Step 3: Update Database Schema

Run the following SQL in your Supabase SQL Editor to add the `user_id` column to the tasks table:

```sql
-- Add user_id column to tasks table
ALTER TABLE tasks
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX idx_tasks_user_id ON tasks(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see their own tasks
CREATE POLICY "Users can view their own tasks"
ON tasks FOR SELECT
USING (auth.uid() = user_id);

-- Create policy: Users can only insert their own tasks
CREATE POLICY "Users can insert their own tasks"
ON tasks FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can only update their own tasks
CREATE POLICY "Users can update their own tasks"
ON tasks FOR UPDATE
USING (auth.uid() = user_id);

-- Create policy: Users can only delete their own tasks
CREATE POLICY "Users can delete their own tasks"
ON tasks FOR DELETE
USING (auth.uid() = user_id);
```

## Step 4: Set Environment Variables

1. Copy `.env.local.example` to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```

2. Update `.env.local` with your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

   You can find these values in your Supabase Dashboard under **Settings** > **API**.

## Step 5: Update Production Environment Variables

If deploying to Vercel:

1. Go to your Vercel project settings
2. Navigate to **Settings** > **Environment Variables**
3. Add the same environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Redeploy your application

## Step 6: Test Authentication

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Open http://localhost:3000

3. You should see the sign-in page

4. Click "Sign in with Google"

5. Sign in with `gil.alroy@gmail.com` - you should be able to access the app

6. Try signing in with a different email - you should see an "Access Denied" message

## Security Features Implemented

- **Email Whitelist**: Only `gil.alroy@gmail.com` can access the app
- **Row Level Security (RLS)**: Database-level security ensures users can only access their own tasks
- **User-specific Data**: All tasks are associated with a user_id
- **Real-time Filtering**: Supabase Realtime subscription filters by user_id
- **Protected Routes**: Unauthenticated users are redirected to sign-in page

## Troubleshooting

### Issue: "Invalid redirect URI"
- Make sure the redirect URI in Google Cloud Console exactly matches your Supabase callback URL
- Check that you've added both production and development URLs

### Issue: "Authentication failed"
- Verify your Google OAuth credentials in Supabase
- Check that the Google+ API is enabled in Google Cloud Console

### Issue: "Access Denied" even with correct email
- Check the email whitelist in `/contexts/auth-context.tsx` (line 15)
- Verify the email matches exactly: `gil.alroy@gmail.com`

### Issue: Can't see tasks after signing in
- Run the database migration SQL (Step 3)
- Check that RLS policies are created correctly
- Verify the user_id column exists in the tasks table

## Code Structure

- `/contexts/auth-context.tsx` - Authentication context and email whitelist
- `/components/auth/sign-in.tsx` - Sign-in page with Google button
- `/components/auth/unauthorized.tsx` - Access denied page
- `/components/auth/auth-header.tsx` - Header with user info and sign-out
- `/app/auth/callback/route.ts` - OAuth callback handler
- `/app/page.tsx` - Main app with authentication checks

## Next Steps

After setup is complete:
1. Test signing in with the whitelisted email
2. Create some tasks to verify they're saved correctly
3. Sign out and sign in again to verify tasks persist
4. Try signing in with a different email to verify access restriction
