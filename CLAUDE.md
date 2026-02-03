# Knots - To-Do App Project Context

## Project Overview
This is a Next.js 14 to-do app called "Knots" with Supabase database integration, drag-and-drop functionality, and a refined design system using oklch color space.

**Live URL:** https://v0-knots-taker.vercel.app/
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
- `supabase-migration-task-provenance.sql` - Source tracking columns and ingest log table

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

### `/components/hamburger-menu.tsx`
Hamburger menu with slide-out drawer:
- Hamburger icon button (3 lines) at top-right
- Opens slide-out drawer from right side
- Contains user avatar, email, and "Sign out" button
- Semi-transparent backdrop overlay
- Uses `useAuth()` hook for user data and sign out

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
- ✅ Slack-created tasks appear in real-time without refresh
- ✅ Slack mention ingestion with heuristic + LLM pipeline
- ✅ Actionability scoring to filter non-actionable mentions
- ✅ Task deduplication based on source_id

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
- Slack-created tasks trigger real-time INSERT events and appear without page refresh

## Slack Mention Ingestion Pipeline

### Overview
The app uses a heuristic + LLM pipeline to intelligently determine which Slack mentions should become tasks.

### Pipeline Flow
1. **Normalize** - Raw Slack event → `SlackIngestMessage`
2. **Ensure Permalink** - Fetch via Slack API if not present
3. **Heuristic Score** - Compute actionability score (0-1)
4. **Decision Gate** - Skip LLM if score < 0.35
5. **LLM Classification** - Claude classifies if mention is a task
6. **Confidence Check** - Apply threshold based on actionability score
7. **Task Creation** - Insert with deduplication

### Actionability Scoring
Strong positive signals (direct asks, ownership, deadlines):
- "can you review", "please fix", "assigned to you", "by EOD"

Strong negative signals (informational routing):
- "FYI", "for visibility", "looping you in", "heads up"

### Thresholds
- `score < 0.35`: Drop without LLM call
- `0.35 <= score < 0.60`: Require LLM confidence >= 0.75
- `score >= 0.60`: Require LLM confidence >= 0.65

### Key Files
- `lib/slack/ingest/types.ts` - Data contracts and thresholds
- `lib/slack/ingest/normalize.ts` - Payload normalization
- `lib/slack/ingest/actionability.ts` - Heuristic scoring
- `lib/slack/ingest/classify.ts` - LLM classification
- `lib/slack/ingest/create-task.ts` - Task creation with dedupe
- `app/api/ingest/slack-mention/route.ts` - API endpoint

### Environment Variables
```
ANTHROPIC_API_KEY=your-key        # Required for LLM classification
STORE_RAW_SLACK_TEXT=false        # Optional: store raw message text
```

## Testing
Run tests with: `npm test`
Tests include:
- Cross-tab sync state updates for INSERT, UPDATE, DELETE events
- Reorder operations and position management
- Rapid sequential operations handling
- Slack actionability heuristic scoring
- LLM JSON schema validation and fallback
- Task deduplication logic
