# Knots - To-Do App Project Context


## Project Overview
This is a Next.js 14 to-do app called "Knots" with Supabase database integration, drag-and-drop functionality, and a refined design system using oklch color space.

**Live URL:** https://app.knots.bot/
**Repository:** https://github.com/alroy/To-Do

## Tech Stack
- **Framework:** Next.js 14 (App Router, TypeScript)
- **Database:** Supabase (PostgreSQL)
- **Styling:** Tailwind CSS with custom oklch color palette
- **Drag-and-Drop:** @dnd-kit libraries
- **Deployment:** Vercel (auto-deploys from main branch)

## Database Schema (Supabase)
Table: `tasks`
- `id` (uuid, primary key)
- `title` (text)
- `description` (text, nullable)
- `status` ('active' | 'completed')
- `position` (integer) - For persistent ordering, 0 = top
- `created_at` (timestamp)
- `completed_at` (timestamp, nullable)
- `source_type` (text, nullable) - Source of task (e.g., 'slack')
- `source_id` (text, nullable) - Unique ID for deduplication
- `source_url` (text, nullable) - Permalink to source
- `llm_confidence` (real, nullable) - LLM confidence score (0-1)
- `llm_why` (text, nullable) - LLM reasoning for logs
- `ingest_trigger` (text, nullable) - How task was ingested (e.g., 'mention')

**Unique constraint:** `(user_id, source_type, source_id)` prevents duplicate tasks from same source.

**Required migrations:**
- `supabase-migration-cross-tab-sync.sql` - Position column and REPLICA IDENTITY FULL
- `supabase-migration-task-provenance.sql` - Source tracking columns
- `supabase-migration-user-approval.sql` - User approval column and auto-approve trigger

## Design System

### Color Palette
Uses oklch color space with warm gray-blue hue (240):
- **Primary:** oklch(0.55 0.06 240) - Main interactive color
- **Accent:** oklch(0.94 0.008 240) - Card backgrounds
- **Accent Hover:** oklch(0.97 0.004 240) - Card hover states
- **Accent Subtle:** oklch(0.96 0.004 240) - Completed card backgrounds
- **Muted Foreground:** oklch(0.55 0.015 240) - Secondary text
- **Border:** oklch(0.90 0.008 240) - Borders and dividers

All colors defined in `app/globals.css` with dark mode variants.

### Typography
System fonts for optimal native appearance:
- Sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial'
- Mono: ui-monospace, 'SF Mono', 'Cascadia Code', 'Consolas', 'Liberation Mono', 'Menlo'

## Key Components

### `/app/page.tsx`
Main page with Supabase integration:
- Loads knots from database on mount
- Implements CRUD operations with optimistic updates
- Error rollback on database failures
- Drag-and-drop reordering
- Real-time sync via Supabase Realtime (changes appear instantly across devices)
- Hamburger menu at top-right for user profile/sign out
- KnotForm FAB at bottom-right for adding new tasks

### `/components/knot-form.tsx`
Floating Action Button (FAB) with modal form:
- FAB fixed at bottom-right corner (56px circular button)
- Opens centered modal form on click with backdrop overlay
- Form contains title input and optional description
- Closes on submit/cancel or backdrop click
- Custom KnotIcon SVG component

### `/components/auth/sign-in.tsx`
Google OAuth sign-in page:
- Single "Sign in with Google" button with Google icon
- Error display for failed sign-in attempts
- Integration logos footer (Slack, Granola, Gmail, Monday.com)

### `/components/sortable-knot-list.tsx`
Drag-and-drop list using @dnd-kit:
- SortableContext for reordering
- Handles drag events and animations
- Integrates with knot card components

### `/components/ui/`
Reusable UI components:
- `button.tsx` - Size variants: default, sm, lg, icon
- `input.tsx` - Text input with consistent styling
- `textarea.tsx` - Multi-line text input
- `label.tsx` - Form labels
- `provenance-row.tsx` - Source provenance row for task cards (icon + "View in {source}" link)

### `/lib/supabase.ts`
Supabase client configuration for database operations.

### `/lib/utils.ts`
Utility functions:
- `cn()` - Tailwind class name merger
- `formatRelativeTime()` - Formats timestamps as relative time (e.g., "just now", "10 min ago", "yesterday", "3 days ago"). After 7 days, shows absolute date (e.g., "Jan 24"). Handles UTC timestamps from Supabase correctly.

## Task Timestamps

### Display Format
- `just now` - Less than 1 minute ago
- `X min ago` - Less than 1 hour
- `X hours ago` - Less than 24 hours
- `yesterday` - 1 day ago
- `X days ago` - 2-6 days ago
- `Jan 24` - 7+ days (absolute date, no year)

### Implementation
- Each task has a `created_at` timestamp (stored in UTC)
- Displayed below the task title in muted text (`text-xs text-muted-foreground`)
- Falls back to "just now" if timestamp is unavailable
- UTC timestamps from Supabase are normalized (appends 'Z' suffix if missing) to ensure correct timezone handling

## Development Workflow

### Git Branches
- `main` - Production branch (auto-deploys to Vercel)
- `claude/todo-app-integrations-Cfwcq` - Current feature branch for integrations
- Branch naming: `claude/*-Cfwcq` format required for push access

### Commit & Push
Always use:
```bash
git push -u origin <branch-name>
```
Retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s) on network failures.

### Creating Pull Requests
1. Push changes to feature branch
2. Create PR via GitHub: `https://github.com/alroy/To-Do/compare/main...<branch-name>`
3. Merge to main triggers auto-deployment to Vercel

## Monday.com Integration

### Architecture
- **Shared API key** via `MONDAY_API_KEY` env var (all users are in the same Monday org)
- **Per-user Board ID** stored in `monday_connections` table
- Users only need to enter their Board ID — no individual API keys

### Onboarding
After profile setup, new users see a second step to connect their Monday board:
- Enter Board ID (found in the board URL after `/boards/`)
- Test connection button validates board exists
- "Skip for now" option available
- Can also connect later via Me tab → Monday.com settings

### Settings
- **Component:** `components/settings/monday-settings.tsx`
- Shows connected board ID or "Connect" button
- Test button calls `POST /api/monday/test-board` (uses shared env var key server-side)
- Board ID saved to `monday_connections` table with `api_key = 'shared'`

### Sync
- **Cron:** `app/api/cron/sync-action-items/route.ts` — runs every 30 min, syncs all users
- **Manual:** `app/api/sync/action-items/route.ts` — per-user trigger
- Both use `MONDAY_API_KEY` env var + per-user `board_id` from DB
- Column IDs are hardcoded in `lib/monday/sync.ts` for the standard board layout

### Environment Variables
```
MONDAY_API_KEY=your-shared-monday-api-key   # Required for Monday.com sync
ADMIN_EMAIL=gil.alroy@gmail.com             # Server-side: admin email for API routes
NEXT_PUBLIC_ADMIN_EMAIL=gil.alroy@gmail.com # Client-side: admin check in auth context
NEXT_PUBLIC_SITE_URL=https://app.knots.bot  # Site URL for auth redirects
```

## Current State
- ✅ Supabase integration complete (CRUD operations)
- ✅ Real-time sync across devices via Supabase Realtime (create, update, delete, reorder)
- ✅ Cross-tab sync for all operations including reorder
- ✅ KnotForm as FAB with modal overlay
- ✅ Hamburger menu with slide-out drawer for user profile
- ✅ Drag-and-drop functionality with persistent ordering
- ✅ Refined oklch color palette with hover states
- ✅ Optimistic UI updates with error handling
- ✅ All CSS variables defined for card styling
- ✅ Unit tests for cross-tab sync state updates
- ✅ Task timestamps with relative time display
- ✅ New tasks appear first in list (position 0)
- ✅ Task deduplication based on source_id
- ✅ Provenance row on task cards for Slack/Granola/Gmail/Notetaker sources
- ✅ Snooze exit animation (slide-out-to-right) in Tasks tab
- ✅ Move-to-tasks exit animation (slide-out-to-left) in Backlog tab
- ✅ Entrance animation (slide-in-from-right) for tasks arriving from backlog
- ✅ Goal completion reorder animation (fade-out, reorder, fade-in)
- ✅ Timestamp preservation across snooze/unsnoozed round-trips
- ✅ Goals tab: byline (timestamp + linked tasks) on its own line below title
- ✅ Backlog cards do not show snooze CTA (snooze only in Tasks tab)
- ✅ Monday.com integration with shared API key (env var) and per-user Board ID
- ✅ Onboarding flow: profile setup → Monday board connection
- ✅ Morning Brief removed (no longer part of UI)
- ✅ Google OAuth authentication (replaced email/password + magic link)

## Animations & Transitions

All animations use `tw-animate-css` (imported in `globals.css`). Duration is 300ms unless noted.

### Snooze (Tasks → Backlog)
- **Exit:** Card plays `animate-out fade-out slide-out-to-right` (300ms, `fill-mode-forwards`), then is removed from the tasks list and inserted into the backlog table with `snoozed_until`.
- **State:** `snoozingId` in `tasks-tab.tsx` → passed to `SortableKnotList` → `KnotCard.isSnoozing`.
- Snooze icon (Clock) with quick-pick menu (Tomorrow, 3 days, Next week, 2 weeks) is only shown in the **Tasks tab**. Backlog cards do **not** have a snooze CTA.

### Move to Tasks (Backlog → Tasks)
- **Exit (backlog side):** Card plays `animate-out fade-out slide-out-to-left` (300ms, `fill-mode-forwards`), then is removed and inserted into the tasks table.
- **State:** `movingToTasksId` in `backlog-tab.tsx` → `BacklogCard.isMovingToTasks`.
- **Entrance (tasks side):** The new task arrives via Supabase Realtime INSERT. It plays `animate-in fade-in slide-in-from-right` (300ms).
- **State:** `enteringId` in `tasks-tab.tsx` → `SortableKnotList` → `KnotCard.isEntering`. Cleared after 400ms.

### Timestamp Preservation
When a task is snoozed to backlog and later moved back, the original `created_at` is preserved through both hops so the task shows its original timestamp (e.g., "yesterday"), not "just now".

### Goal Completion Reorder
- When a goal is checked (completed), it fades out (`animate-out fade-out`, 300ms) via `reorderingId`, then the list reorders (active first, completed last), and the card fades in at its new position (`animate-in fade-in`, 300ms) via `settledId`.
- Initial load also sorts active goals above completed ones.
- **State:** `reorderingId` and `settledId` in `goals-tab.tsx` → `GoalCard.isReordering` / `GoalCard.isSettling`.

### Task Completion
- Card shows completed state for 1.2s, then plays `slide-out-to-right` exit animation (reuses `snoozingId`), removed from tasks, inserted into backlog as resolved.

### General Card Entrance
- All task cards (non-snoozing, non-entering) get a default `animate-in fade-in duration-300` on mount.

## Important Notes
- Always use optimistic updates for better UX
- Include error rollback on database failures
- Real-time sync uses Supabase Realtime subscriptions (listens to INSERT, UPDATE, DELETE)
- Cross-tab sync works by persisting position to database and receiving UPDATE events
- REPLICA IDENTITY FULL is required for DELETE events to include user_id for filtering
- Maintain oklch color consistency across components
- Button component supports size prop for different variants
- Focus states use 1px ring with 20% opacity
- Cards use accent-hover and accent-subtle variables for states
- New tasks always appear at top of list (position 0), database trigger handles position shifting
- Monday.com is the sole external source for task ingestion (Slack app removed)

## Testing
Run tests with: `npm test`
Tests include:
- Cross-tab sync state updates for INSERT, UPDATE, DELETE events
- Reorder operations and position management
- Rapid sequential operations handling
# trigger
