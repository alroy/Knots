# Chief of Staff — Implementation Plan

Transform the existing Knots to-do app into an AI Chief of Staff system. All new entities live in Supabase alongside existing tasks. Navigation via bottom tab bar. No separate dashboard — everything integrates into the current mobile-first design.

---

## Phase 1: Database Schema — New Supabase Tables

Create migration SQL and run against Supabase. Four new tables:

### `goals` table
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| user_id | uuid FK auth.users | RLS enforced |
| title | text | e.g. "Ship v2 to production" |
| description | text | Success criteria, context |
| priority | integer | 1 = P0, 2 = P1, 3 = P2 |
| status | text | 'active' / 'completed' / 'at_risk' |
| metrics | text | Key metrics accountable for |
| deadline | date | nullable |
| risks | text | Known risks/blockers |
| position | integer | For drag-and-drop ordering |
| created_at | timestamptz | default now() |
| completed_at | timestamptz | nullable |

### `people` table
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK auth.users | |
| name | text | Full name |
| role | text | Their job title |
| relationship | text | 'manager' / 'report' / 'stakeholder' |
| context | text | What they care about, expectations |
| strengths | text | nullable |
| growth_areas | text | nullable |
| motivations | text | nullable |
| communication_style | text | How they prefer to receive info |
| current_focus | text | nullable |
| risks_concerns | text | nullable |
| position | integer | For ordering |
| created_at | timestamptz | |

### `backlog` table
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK auth.users | |
| title | text | |
| description | text | |
| category | text | 'question' / 'decision' / 'process' / 'idea' / 'action' |
| status | text | 'open' / 'resolved' |
| position | integer | |
| created_at | timestamptz | |
| resolved_at | timestamptz | nullable |

### `user_profile` table (CLAUDE.md equivalent)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK auth.users | unique constraint |
| name | text | User's full name |
| role_title | text | Job title |
| role_description | text | Core responsibilities |
| communication_style | text | How they prefer info |
| thinking_style | text | How they approach problems |
| blind_spots | text | What to challenge on |
| energy_drains | text | What drains vs energizes |
| ai_instructions | text | Specific AI working instructions |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**RLS policies:** Same pattern as tasks — users can only access their own rows.
**Realtime:** Enable for all tables (for cross-device sync).

### Files to create/modify
- New: `supabase-migration-chief-of-staff.sql`
- No code changes yet — just the migration

---

## Phase 2: Bottom Tab Bar Navigation

Add a fixed bottom tab bar and restructure routing. The current `/` page becomes the Tasks tab.

### Navigation structure
```
[Tasks]  [Goals]  [People]  [Backlog]  [Me]
```

- **Tasks** — Current task list (existing page.tsx logic)
- **Goals** — Priority goals with status
- **People** — 1-1 contact profiles
- **Backlog** — Open questions, ideas, actions
- **Me** — User profile/AI preferences (replaces hamburger menu as profile destination)

### Implementation approach
- Keep app as a single-page app with client-side tab switching (no Next.js routing for tabs — keeps it fast and preserves state)
- Each tab is a React component that lazy-loads its content
- Tab state persisted in URL hash (#tasks, #goals, etc.) for shareability
- The existing hamburger menu stays for sign-out/settings; the "Me" tab is for the profile content
- FAB (+) button context-aware: adds a task on Tasks tab, a goal on Goals tab, etc.

### New files
- `components/tab-bar.tsx` — Bottom tab bar component
- `components/tabs/tasks-tab.tsx` — Extract current task list from page.tsx
- `components/tabs/goals-tab.tsx` — Goals list (Phase 3)
- `components/tabs/people-tab.tsx` — People list (Phase 4)
- `components/tabs/backlog-tab.tsx` — Backlog list (Phase 5)
- `components/tabs/profile-tab.tsx` — User profile (Phase 6)

### Modify
- `app/page.tsx` — Refactor to use TabBar + tab components, move task logic to tasks-tab
- `app/globals.css` — Tab bar styles, safe-area-inset-bottom for iOS
- `components/knot-form.tsx` — FAB position adjustment (above tab bar)

### Design
- Tab bar: fixed bottom, 56px height, background matches app
- Icons: use lucide-react (CheckSquare, Target, Users, Archive, User)
- Active tab: primary color indicator (bottom border or filled icon)
- Inactive: muted-foreground
- Safe area inset for iOS notch devices
- Desktop: tab bar at bottom still (mobile-first, works fine on desktop too)

---

## Phase 3: Goals Section

Card-based list similar to tasks but structured for goals.

### Goal Card design
- Priority badge (P0 red, P1 orange, P2 blue)
- Title (bold)
- Description preview (2 lines, truncated)
- Status indicator (active/at-risk/completed)
- Deadline (if set) with relative time
- Tap to expand/edit

### Features
- CRUD operations with Supabase
- Optimistic updates (same pattern as tasks)
- Drag-and-drop reordering (reuse @dnd-kit pattern)
- Real-time sync
- FAB opens goal creation form (title, description, priority, deadline, metrics, risks)

### New files
- `components/goal-card.tsx`
- `components/goal-form.tsx` — Modal form for create/edit (reuse KnotForm pattern)
- `components/sortable-goal-list.tsx` — Reuse SortableKnotList pattern

---

## Phase 4: People Section

Contact cards for 1-1 relationships.

### Person Card design
- Name (bold) + role subtitle
- Relationship badge (Manager / Report / Stakeholder)
- Current focus (1 line preview)
- Tap to view full profile

### Person Detail view
- Full-screen slide-in (or expand in-place on mobile)
- All fields displayed in clean sections
- Edit button to modify
- Link to related tasks (future enhancement)

### Features
- CRUD with Supabase
- Grouped by relationship type (Manager first, then Reports, then Stakeholders)
- FAB opens person creation form
- No drag-and-drop needed (grouped by relationship, alphabetical within group)

### New files
- `components/person-card.tsx`
- `components/person-form.tsx`
- `components/person-detail.tsx`

---

## Phase 5: Backlog Section

Categorized list of strategic items.

### Backlog Card design
- Category chip (Question / Decision / Process / Idea / Action)
- Title
- Description preview
- Status (open/resolved)
- Created timestamp

### Features
- CRUD with Supabase
- Filter by category (horizontal chip bar at top)
- Drag-and-drop reordering within category
- Resolve action (like completing a task)
- FAB opens backlog item form (title, description, category)

### New files
- `components/backlog-card.tsx`
- `components/backlog-form.tsx`
- `components/sortable-backlog-list.tsx`

---

## Phase 6: User Profile ("Me" Tab)

The CLAUDE.md equivalent — stored in Supabase.

### Profile view
- Sections displayed as editable cards:
  - **Identity:** Name, role title, responsibilities
  - **Communication:** Style, how you think
  - **Growth:** Blind spots, energy drains/boosters
  - **AI Instructions:** How the AI should work with you
- Each section: tap to edit inline
- Clean, form-like layout

### Features
- Single row per user in user_profile table
- Auto-save on field blur (debounced)
- This data will eventually feed into AI interactions (Claude API calls with user context)

### New files
- `components/profile-section.tsx` — Reusable section card with edit mode
- Move sign-out and Slack settings to this tab (or keep in hamburger, user preference)

---

## Phase 7: Transcript Parser — AI-Powered Population

API route that accepts a text transcript and uses Claude to extract and populate all sections.

### How it works
1. User pastes transcript into a text area (accessible from profile tab or onboarding flow)
2. Frontend sends transcript to `/api/parse-transcript`
3. API route calls Claude with structured extraction prompt
4. Claude returns JSON with: goals, people, backlog items, profile data
5. Frontend receives parsed data and inserts into Supabase tables
6. User reviews and edits populated data

### API route: `/api/parse-transcript/route.ts`
- Accepts POST with `{ transcript: string }`
- Calls Claude (using existing @anthropic-ai/sdk dependency)
- System prompt instructs structured extraction into JSON matching our schema
- Returns parsed data for client-side review before insert

### Extraction schema (what Claude returns)
```typescript
{
  profile: { name, role_title, role_description, communication_style, thinking_style, blind_spots, energy_drains, ai_instructions },
  goals: [{ title, description, priority, metrics, deadline, risks }],
  people: [{ name, role, relationship, context, strengths, growth_areas, motivations, communication_style, current_focus, risks_concerns }],
  backlog: [{ title, description, category }]
}
```

### UI flow
- "Import from transcript" button on profile tab (or first-run onboarding)
- Large textarea + "Parse" button
- Loading state while Claude processes
- Review screen showing extracted data before confirming insert
- [TBD] placeholders shown as editable yellow-highlighted fields

### New files
- `app/api/parse-transcript/route.ts`
- `components/transcript-import.tsx`

---

## Implementation Order

| Step | What | Independently deployable? |
|------|------|--------------------------|
| 1 | Database migration (all 4 tables) | Yes (no UI impact) |
| 2 | Tab bar + extract tasks tab | Yes (same UX, new nav) |
| 3 | Goals tab (CRUD + cards) | Yes |
| 4 | People tab (CRUD + cards) | Yes |
| 5 | Backlog tab (CRUD + cards) | Yes |
| 6 | Profile tab | Yes |
| 7 | Transcript parser | Yes |

Each phase builds on the previous but ships independently. Phase 2 (tab bar) is the critical foundation that enables all subsequent sections.

---

## What's NOT in scope (future iterations)
- Calendar/meeting integration (Google Calendar API)
- Weekly prep generation (AI-generated meeting prep from people + goals)
- Linking tasks to goals or people
- AI-powered suggestions ("You should prep for your 1-1 with X")
- The 3-column desktop dashboard from the workshop guide
- Real-time collaboration features
