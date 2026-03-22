# Knots — To-Do App

Knots is a task management app built with Next.js and Supabase. It features drag-and-drop reordering, real-time sync across devices, email/password and magic-link authentication, a backlog with snooze, goals tracking, and Monday.com integration for task ingestion.

**Live:** https://v0-knots-taker.vercel.app/

## Tech Stack

- **Framework:** Next.js 14 (App Router, TypeScript)
- **Database:** Supabase (PostgreSQL with Row Level Security)
- **Styling:** Tailwind CSS with custom oklch color palette
- **Drag-and-Drop:** @dnd-kit
- **Deployment:** Vercel

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- (Optional) A [Monday.com](https://monday.com) account for task ingestion

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/alroy/To-Do.git
   cd To-Do
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure environment variables:**

   Copy the example file and fill in your Supabase credentials:

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` with your values:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   NEXT_PUBLIC_ALLOWED_EMAILS=user1@example.com,user2@example.com
   ```

   For Monday.com integration (optional):

   ```env
   MONDAY_API_KEY=your-shared-monday-api-key
   ADMIN_EMAIL=admin@example.com
   NEXT_PUBLIC_ADMIN_EMAIL=admin@example.com
   ```

4. **Set up the database** (see next section).

5. **Start the development server:**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000 in your browser.

## Database Setup

Run the following SQL migration scripts **in order** in the [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql). Each script is idempotent and safe to re-run.

| # | Script | Purpose |
|---|--------|---------|
| 1 | `supabase-migration.sql` | Creates the `tasks` table, adds `user_id` column, enables Row Level Security, and sets up RLS policies and auto-`user_id` trigger. **Run this first.** |
| 2 | `supabase-migration-cross-tab-sync.sql` | Adds `position` column for persistent drag-and-drop ordering, sets `REPLICA IDENTITY FULL` (required for Realtime DELETE events), and creates auto-position trigger. |
| 3 | `supabase-migration-task-provenance.sql` | Adds source tracking columns (`source_type`, `source_id`, `source_url`), LLM metadata columns, deduplication constraint, and the `slack_mention_ingest_log` table. |
| 4 | `supabase-migration-user-approval.sql` | Adds `approved` column to `user_profile`, auto-profile trigger on sign-up, and admin auto-approve logic. |
| 5 | `supabase-migration-auto-profile.sql` | Auto-creates user profile on first sign-in. |
| 6 | `supabase-migration-avatar.sql` | Adds avatar support to user profiles. |
| 7 | `supabase-migration-backlog-snooze.sql` | Adds snooze/backlog columns (`snoozed_until`) for the backlog feature. |
| 8 | `supabase-migration-backlog-soft-delete.sql` | Adds soft-delete support for backlog items. |
| 9 | `supabase-migration-backlog-task-metadata.sql` | Adds metadata columns for backlog tasks. |
| 10 | `supabase-migration-task-metadata.sql` | Adds extra metadata fields to tasks. |
| 11 | `supabase-migration-goals-archive.sql` | Adds goals and archive functionality. |
| 12 | `supabase-migration-dedup-and-linking.sql` | Enhanced deduplication and task linking. |
| 13 | `supabase-migration-notetaker-source.sql` | Adds notetaker as a task source type. |
| 14 | `supabase-migration-calendar-events.sql` | Adds calendar events integration table. |
| 15 | `supabase-migration-action-items.sql` | Adds action items support. |
| 16 | `supabase-migration-monday-connections.sql` | Creates `monday_connections` table for per-user Monday.com board IDs. |
| 17 | `supabase-migration-monday-board-id.sql` | Adds board ID column for Monday.com integration. |
| 18 | `supabase-migration-monday-dedup.sql` | Monday.com task deduplication logic. |
| 19 | `supabase-migration-profile-location.sql` | Adds location field to user profiles. |
| 20 | `supabase-migration-people-location.sql` | Adds people/location tracking. |
| 21 | `supabase-migration-team-relationship.sql` | Adds team relationship support. |
| 22 | `supabase-migration-chief-of-staff.sql` | Adds chief-of-staff features. |

> **Tip:** You can also run them all at once by pasting each script sequentially into the SQL Editor.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Create production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |

## Deployment

The app auto-deploys to Vercel when changes are merged to the `main` branch. To deploy manually:

1. Push your branch to GitHub.
2. Create a PR targeting `main`.
3. Merge — Vercel picks up the change automatically.

## Project Structure

```
app/             → Next.js App Router pages and API routes
components/      → React components (UI, auth, settings)
contexts/        → React context providers
hooks/           → Custom React hooks
lib/             → Utilities, Supabase client, Monday.com sync
tests/           → Vitest test files
public/          → Static assets
```
