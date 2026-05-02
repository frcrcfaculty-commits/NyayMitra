# NyayMitra — Full Project Setup & Day 1-7 Implementation

## Current State

The project directory (`/Users/hansalpersonalai/Documents/Indian Legal Firm App`) is **completely empty**. The user's prompt references documentation, content, and migrations that were supposed to be created by Claude (the other agent), but none of that exists yet.

> [!IMPORTANT]
> **The codebase referenced in the prompt does not exist.** I will scaffold everything from scratch — both the parts I own (`src/`, `supabase/functions/`, mobile build) and the foundational parts (docs, project config, Supabase schema) that are needed for my work to function.

## Proposed Approach

Since the project directory is empty, I'll:

1. **Scaffold the full Vite + React + TypeScript project** with all necessary dependencies
2. **Create the documentation structure** (docs/, content/) with the referenced files so the project is self-documenting
3. **Create Supabase migrations** for the schema (statutes, scenarios tables)
4. **Execute all Day 1-7 tasks** as specified

## Open Questions

> [!WARNING]
> The user mentioned Claude owns `docs/`, `content/`, `supabase/migrations/`, and `ingestion/`. Since the repo is empty, I'll create minimal versions of these to unblock my work. Claude can take ownership of them later. Should I proceed with this approach, or should we wait for Claude to set up their parts first?

> [!IMPORTANT]
> No Supabase project URL or anon key is available. I'll create a `.env.example` with placeholder values and use `supabase start` for local development. The user will need to provide actual credentials for production.

## Proposed Changes

### Phase 1: Project Scaffold (Day 1, Tasks 1-5)

#### [NEW] Project initialization via Vite
- `pnpm create vite . --template react-ts`
- Install all dependencies with `--strict-peer-dependencies=false`

#### [NEW] Documentation structure
- `docs/prompts/agent-antigravity.md` — Agent role definition
- `docs/ARCHITECTURE.md` — System architecture
- `docs/ROADMAP.md` — Task tracking with checkboxes
- `docs/COMPLIANCE.md` — Legal compliance notes
- `docs/prompts/system_prompts.md` — AI chat prompts
- `docs/handoffs/from-claude.md` — Handoff from Claude
- `docs/handoffs/from-antigravity.md` — Handoff to Claude

#### [NEW] Supabase configuration
- `supabase/config.toml`
- `supabase/migrations/` — Schema migrations for statutes, scenarios, profiles

#### [NEW] shadcn/ui initialization
- Configure with slate base color
- Add: button, input, card, tabs, dialog, dropdown-menu, toast, skeleton, alert, label

---

### Phase 2: i18n & Layout (Day 2, Tasks 6-8)

#### [NEW] i18n setup
- `src/i18n/locales/en.json`, `hi.json`, `mr.json`
- i18next + react-i18next configuration
- Language toggle component

#### [NEW] Layout component
- `src/components/Layout.tsx` — Header, footer, main content
- Logo, nav, language toggle, auth state indicator
- Legal disclaimer footer on every page

---

### Phase 3: Rights Pages (Day 3-4, Tasks 9-11)

#### [NEW] Rights listing page
- `src/pages/Rights.tsx` — Lists scenarios with category filters
- TanStack Query for data fetching
- Language-aware content

#### [NEW] Rights detail page
- `src/pages/RightsDetail.tsx` — Single scenario view
- Markdown rendering via react-markdown
- Related statute links

#### [NEW] Seed script
- `scripts/seed-scenarios.ts` — Parse markdown content files into Supabase rows

---

### Phase 4: Chat (Day 5-7, Tasks 12-13)

#### [NEW] Chat page
- `src/pages/Chat.tsx` — Streaming chat UI
- SSE-based message streaming
- Citation badges with verification warnings

#### [NEW] Chat edge function
- `supabase/functions/chat/index.ts` — Full pipeline per system prompt
- SSE streaming responses

## Verification Plan

### Automated Tests
- `pnpm dev` starts successfully on localhost:5173
- `supabase start && supabase db reset` applies migrations
- All pages render on 375px viewport
- i18n toggles between en/hi/mr

### Manual Verification
- Visual check of all pages in browser
- Mobile viewport testing
- Chat streaming functionality
