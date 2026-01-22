# Smart Todo App - Setup Guide

## ✅ Phase 0: Complete!

You now have a working Next.js 14 app with:
- TypeScript
- Tailwind CSS
- Supabase client configured
- Git initialized

---

## 🔑 Next Steps: Add Your Credentials

### 1. Get Supabase Credentials

1. Go to https://supabase.com/dashboard
2. Select your project (or create a new one)
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** (starts with https://xxx.supabase.co)
   - **anon/public key** (long string starting with eyJ...)

### 2. Update .env.local

Open `.env.local` and replace the placeholders:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key-here
ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

### 3. Create Tasks Table in Supabase

Go to your Supabase project → **SQL Editor** → **New query**

Paste and run this SQL:

```sql
-- Create tasks table
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text default 'active',
  priority text default 'medium',
  created_at timestamp default now(),
  completed_at timestamp,
  user_id uuid references auth.users
);

-- Enable Row Level Security
alter table tasks enable row level security;

-- Create policy: Users can only see their own tasks
create policy "Users can view their own tasks"
  on tasks for select
  using (auth.uid() = user_id);

-- Create policy: Users can insert their own tasks
create policy "Users can insert their own tasks"
  on tasks for insert
  with check (auth.uid() = user_id);

-- Create policy: Users can update their own tasks
create policy "Users can update their own tasks"
  on tasks for update
  using (auth.uid() = user_id);

-- Create policy: Users can delete their own tasks
create policy "Users can delete their own tasks"
  on tasks for delete
  using (auth.uid() = user_id);
```

---

## 🚀 Run the Dev Server

```bash
npm run dev
```

Open http://localhost:3000 to see your app!

---

## 📦 Deploy to Vercel

You already have a Vercel Pro account, so:

1. Push your code to GitHub:
   ```bash
   # Create a new repo on GitHub first, then:
   git remote add origin https://github.com/your-username/todo-app.git
   git branch -M main
   git push -u origin main
   ```

2. Go to https://vercel.com/new
3. Import your GitHub repository
4. Add environment variables in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `ANTHROPIC_API_KEY`

5. Deploy! 🎉

---

## What's Next?

Once you have:
- ✅ Supabase credentials added
- ✅ Tasks table created
- ✅ Dev server running
- ✅ Deployed to Vercel

You're ready for **Phase 1: Building the Basic Todo App!**

Tell me when you're ready and I'll help you build the UI with v0 or Claude Code.
