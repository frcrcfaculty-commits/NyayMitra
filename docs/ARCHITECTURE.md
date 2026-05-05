# Architecture

## System overview

NyayMitra is a two-tier legal information platform with a shared
retrieval-augmented generation (RAG) backbone.

```
                 ┌────────────────────────────────────┐
                 │       Citizen layer (free)         │
                 │  "know your rights" Q&A,           │
                 │  scenario lookup, vernacular       │
                 └────────────────────────────────────┘
                                  │
                 ┌────────────────────────────────────┐
                 │     Pro layer (paid, planned)      │
                 │  research, drafting,               │
                 │  judgment synthesis                │
                 └────────────────────────────────────┘
                                  │
                 ┌────────────────────────────────────┐
                 │   Tiered LLM router                │
                 │   Tier 0: local Ollama (planned)   │
                 │   Tier 1: Gemini 2.5 Flash         │
                 │   Tier 2: Claude Sonnet 4.6        │
                 │   Tier 3: Claude Opus 4.7 (batch)  │
                 └────────────────────────────────────┘
                                  │
                 ┌────────────────────────────────────┐
                 │   RAG: pgvector + FTS              │
                 │   over Supabase Postgres           │
                 └────────────────────────────────────┘
                                  │
            ┌────────────────────────────────────────┐
            │    Indian legal corpus                 │
            │  - 12 core statutes (IndiaCode)        │
            │  - SC judgments 1950-present (AWS S3)  │
            │  - HC judgments (planned)              │
            │  - 15 citizen-facing scenarios         │
            └────────────────────────────────────────┘
```

## Components

### Frontend (`src/`) — owned by Antigravity

- **Framework:** React 19 + TypeScript + Vite 6 (downgraded from 8 for Node 20.18 compat)
- **Styling:** Tailwind CSS 3 + shadcn/ui (slate base)
- **Routing:** React Router v7
- **Server state:** TanStack Query v5
- **Client state:** Zustand v5
- **i18n:** i18next + react-i18next (en, hi, mr)
- **Markdown:** react-markdown + remark-gfm
- **Mobile:** Capacitor wrapper (planned)

Routes implemented:
- `/` — landing
- `/rights` — scenarios listing with category filters
- `/rights/:slug` — single scenario page
- `/chat` — Q&A chat (streaming SSE)

### Edge functions (`supabase/functions/`) — owned by Antigravity

- `chat/` — citizen-tier Q&A. Tier 1 + Tier 2 routing per ADR 002. Tier 0
  (local Ollama) and PII redaction are planned next.

Planned:
- `redact-pii` — runs before any Tier 1/2 egress.
- `translate-vernacular` — Gemini Flash with cached prompt; demand-driven
  Hindi / Marathi translation.

### Database (Supabase Postgres + pgvector)

Migrations:

| Migration | Owner | Purpose |
|---|---|---|
| `20240101000000_create_statutes.sql` | Antigravity | Initial `statutes` table. |
| `20240101000001_create_scenarios.sql` | Antigravity | Initial `scenarios` table with multi-language columns. |
| `20240101000002_create_profiles_and_chat.sql` | Antigravity | User profiles + chat sessions, with RLS. |
| `20260502000000_add_pgvector_fts_and_ingestion_fields.sql` | Claude | pgvector extension; FTS columns; statute ingestion fields (`statute_slug`, `handle`, `act_id`, `chapter`, `section_number_int`, `embedding`); scenario fields (`key_sections`, `audience`, `embedding`); `query_logs` table; `updated_at` triggers. |

The full schema after all migrations:

- `statutes` — one row per statute section (BNS s.85, etc.). Has full-text
  search vectors and 1024-dim embeddings.
- `statute_section_chunks` — sub-section chunks for RAG, used when a parent
  section is >2000 chars.
- `scenarios` — citizen-facing scenarios from `content/scenarios/`. Mirrored
  into the DB by `scripts/seed-scenarios.mjs`.
- `profiles` — user profiles (extends Supabase `auth.users`).
- `chat_sessions` — chat history.
- `query_logs` — per-query telemetry for the cost dashboard (ADR 002).

### Ingestion (`ingestion/`) — owned by Claude

Python pipelines that pull legal data from public sources and write into
Supabase.

- **`statutes_ingest.py`** — fetches all sections of a statute from
  IndiaCode, parses HTML index + per-section bodies (with PDF fallback for
  older Acts), writes to `statutes` table. Verified live against BNS (358
  sections extracted correctly).
- **`sc_judgments_ingest.py`** — downloads bulk Supreme Court judgments
  from the public AWS S3 bucket. V2-index aware (handles multi-part
  archives for years that exceed 1 GB). Verified live against the 2023
  index.

Designed to run on Hansal's i9 / M3 Max periodically — not on every
request.

### Vector store

pgvector with **1024-dim** embeddings (BGE-large-en class). Reasons:
- Fits comfortably on M3 Max for local generation during ingestion.
- pgvector handles 1024 dimensions well at our scale (estimate <500K
  vectors at MVP).
- Avoids the cost of a managed vector DB.

## Data flow: a citizen Q&A request

1. User submits a question via `/chat`.
2. Frontend calls `/functions/v1/chat` with the message + recent history.
3. **Edge function** (`supabase/functions/chat/index.ts`):
   1. Classifies the query into Tier 1 (Gemini) or Tier 2 (Claude). Tier 0
      (local) is reserved for the future.
   2. Retrieves top-k=8 chunks from `statutes` and `scenarios` (planned;
      currently a no-op while embeddings are being generated).
   3. Builds a `<retrieved_context>` block.
   4. Calls the chosen tier with the appropriate prompt from
      `docs/prompts/system_prompts.md`.
   5. Falls back to the other tier on transient API failures.
   6. Streams the response back over SSE, with the standard disclaimer
      appended.
4. Frontend renders incrementally via SSE.

## Compliance posture (summary)

See `docs/COMPLIANCE.md` for the full text. Key constraints:

- **Advocates Act 1961:** we serve legal *information*, not legal *advice*.
  Every output ends with a disclaimer.
- **DPDP Act 2023:** Tier 0 (local) is the planned default for any query
  containing PII. Cross-border egress to Tier 1/2 only after redaction.
- **Copyright:** statute text from IndiaCode is government public-domain.
  SC judgments are CC-BY-4.0 (attribution required). Our scenario content
  is CC-BY-SA 4.0.

## Non-goals (explicit)

- We are **not** building a court-filing system.
- We are **not** running our own model training or fine-tuning at MVP.
- We are **not** scraping every law-firm website. The corpus is anchored
  on government primary sources.

## Capacity plan (MVP)

Per ADR 002, at 1,000 queries/day and tiered routing (65% Tier 0, 30%
Tier 1, 5% Tier 2):

- **API spend:** ~$25/month for citizen tier
- **Compute:** i9 + M3 Max amortised; ingestion runs <2 hr/week
- **Storage:** 60–80 GB for full SC corpus; ~5 GB for statutes; <500 MB
  for scenarios
- **pgvector:** <500K vectors → comfortably handled by Supabase Pro

Re-evaluate at 5,000 daily queries.

## Known constraints (Antigravity's notes carried forward)

- **Node 20.18.0** — forced Vite 6 instead of Vite 8 (which requires Node
  20.19+). Either upgrade Node or stay on Vite 6.
- **Supabase CLI / Docker not installed locally** — migrations have not
  yet been verified end-to-end on the dev machine. Either install Supabase
  CLI + Docker, or apply migrations through the Supabase Studio web UI.

## Project structure

```
NyayMitra/
├── content/
│   └── scenarios/           # 15 citizen-facing scenarios (Claude)
├── docs/
│   ├── ARCHITECTURE.md      # this file
│   ├── ROADMAP.md
│   ├── COMPLIANCE.md
│   ├── corrections/         # corrections log (Claude)
│   ├── decisions/           # ADRs (Claude)
│   ├── handoffs/            # cross-agent handoffs
│   └── prompts/             # agent briefs + system prompts
├── ingestion/               # Python ingestion pipelines (Claude)
├── scripts/
│   └── seed-scenarios.mjs   # Mirrors content/ into Supabase
├── src/                     # React frontend (Antigravity)
└── supabase/
    ├── functions/           # Edge functions (Antigravity)
    └── migrations/          # SQL migrations (cross-reviewed)
```
