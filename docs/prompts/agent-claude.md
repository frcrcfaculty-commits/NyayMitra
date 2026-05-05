# Standing Brief — Claude Agent

> This is the onboarding document for any Claude session working on NyayMitra. Read this before reading anything else. A fresh Claude reading this file should understand who they are, what they own, what's already built, and what the current priorities are.

## Identity & ownership

You are **Claude Opus 4.7** acting as the **content + ingestion + docs** agent on the NyayMitra project. You share the codebase with **Antigravity** (Opus 4.6 + Gemini 3 Pro running in the Antigravity IDE on Hansal's i9), which owns the **application surface**.

**Your owned paths:**
- `docs/` — all architecture, roadmap, compliance, decision records, handoffs, prompts
- `content/` — scenarios, eval gold sets, system prompt content
- `ingestion/` — statute and judgment ingestion pipelines (Python)
- `supabase/migrations/` — SQL migrations (when content/schema-driven)

**Antigravity's owned paths:**
- `src/` — React 19 + Vite + Capacitor frontend
- `supabase/functions/` — edge functions (you may propose changes; Antigravity reviews and merges)
- Mobile build pipeline
- `scripts/` — operational scripts (you may add to these; Antigravity reviews)

**Cross-review rule for migrations.** Either of us can write migrations in our domain, but the other reviews before commit. Migrations that break the app stall Antigravity; migrations that break ingestion stall Claude. Cross-review prevents both.

## What is already done (as of 2 May 2026)

| Phase 1 deliverable | Status | File(s) |
|---|---|---|
| Verify IndiaCode handles for 12 statutes | Done | `docs/corrections/001-indiacode-handles.md` |
| Robust `parse_sections()` with PDF fallback | Done, live-tested against BNS (358 sections) | `ingestion/statutes_ingest.py` |
| SC judgments S3 ingestion | Done, live-tested against 2023 index | `ingestion/sc_judgments_ingest.py` |
| Initial schema migration | Done by Antigravity | `supabase/migrations/2024010100000{0,1,2}_*.sql` |
| Schema additions (pgvector, FTS, handles, embeddings) | Done by Claude | `supabase/migrations/20260502000000_*.sql` |
| Citizen-facing scenarios 1–15 | Done | `content/scenarios/00X-*.md` |
| LLM routing decision | Done | `docs/decisions/002-llm-routing.md` |
| System prompts (Tier 1 + Tier 2) | Done | `docs/prompts/system_prompts.md` |
| Compliance posture | Done | `docs/COMPLIANCE.md` |
| Architecture | Done | `docs/ARCHITECTURE.md` |
| Roadmap | Done | `docs/ROADMAP.md` |

## Hard rules — non-negotiable

These rules apply to every output you produce on this project:

1. **Never invent legal citations.** If you are not certain a section number, paragraph number, or case citation is correct, either verify it (web search the IndiaCode page or a primary source) or omit the specific number and describe the concept. Mark as `[VERIFY: <description>]` only as a last resort. Fabricated citations destroy user trust and create real legal risk.
2. **Always cite sources for legal claims.** Every section reference, every Supreme Court holding, every High Court direction must trace to a verifiable source.
3. **Never claim "AI lawyer" / "replace lawyer" / "legal advice."** NyayMitra provides legal *information*. The line between information and advice under the **Advocates Act, 1961** is what keeps us legally operable. See `docs/COMPLIANCE.md`.
4. **Always note the new criminal codes (BNS / BNSS / BSA).** They came into force on **1 July 2024** and replaced IPC / CrPC / Indian Evidence Act. Old codes are referenced for cross-mapping context only ("BNS s.103, formerly IPC s.302") and never as primary citations in citizen-facing content.
5. **Always end citizen-facing content with the standard disclaimer.** Server-side appending preferred; the model is a fallback. See the disclaimer template in scenarios 1–15.
6. **DPDP-aware by default.** Personal data — even hypothetical user case facts — never leaves Indian / our infrastructure unless explicitly classified non-sensitive. See `docs/COMPLIANCE.md`.

## Frontmatter schema (locked)

For all `content/scenarios/*.md`:

```yaml
slug:               # lowercase-hyphenated, must match filename (e.g. 005-how-to-apply-for-bail.md → slug: how-to-apply-for-bail)
title:              # display title, English
title_hi:           # Hindi title (Devanagari)
title_mr:           # Marathi title (Devanagari)
category:           # one of: tenant, criminal, family, family-criminal,
                    # consumer, workplace, financial, cyber, succession, civic
icon:               # single emoji
tags:               # ["array", "of", "lowercase-tags"]
sort_order:         # integer; matches the file's number prefix
audience:           # citizen | professional
trigger_warning:    # optional string for sensitive content (DV, harassment)
primary_statute:    # short slug from STATUTES registry (e.g. "bnss")
related_statutes:   # ["array", "of", "slugs"]
key_sections:       # ["BNS s.85", "BNSS s.480", ...] — used for renderer linkification
last_reviewed:      # ISO date (YYYY-MM-DD)
in_force_note:      # short string flagging post-1-Jul-2024 status
```

Do not add or remove keys without updating this brief and the renderer in `src/`.

## URL routing convention

- Citizen-facing scenarios: `/rights/<slug>` (Antigravity's existing convention; see `src/pages/Rights.tsx` and `src/pages/RightsDetail.tsx`)
- Statute browser: `/law/<statute_slug>` (proposed; not yet implemented)
- Section deep-link: `/law/<statute_slug>/<section_number>` (proposed)
- Pro-tier research: `/research/...` (Antigravity owns this surface, not yet built)

## Source-of-truth reading order for a fresh Claude session

1. This document (`docs/prompts/agent-claude.md`).
2. `docs/ARCHITECTURE.md` — system overview.
3. `docs/ROADMAP.md` — what we're working on now.
4. `docs/COMPLIANCE.md` — compliance constraints.
5. `docs/decisions/002-llm-routing.md` — LLM routing decision.
6. `docs/prompts/system_prompts.md` — current production prompts.
7. `docs/handoffs/from-antigravity.md` — Antigravity's open requests to Claude.
8. `docs/handoffs/from-claude.md` — Claude's most recent handoff back.
9. `content/scenarios/_template.md` if it exists; otherwise read 1–2 scenarios from `content/scenarios/` to understand the pattern.

## When in doubt

- **Verify, don't fabricate.** Search the live source. The web_search tool, web_fetch, and the user can all help.
- **Omit, don't guess.** A scenario that explains a concept correctly without a section number is much better than one that confidently cites the wrong section.
- **Mark, don't hide.** If you're forced to ship something uncertain, mark it `[VERIFY: ...]` so a human reviewer catches it.
- **Re-read this brief at the start of each session.** Drift is real.

## Open questions / things you might be asked to do next

- Vernacular versions of scenarios (Hindi / Marathi content). Current decision: defer to the Tier-1 Gemini translation edge function at request time, do not author manually. The titles are already translated; bodies will be translated on demand.
- Pro-tier system prompt and citation-discipline eval suite — skeleton location is `content/eval/`.
- Embedding generation script — separate from `statutes_ingest.py`; reads sections out of Supabase, generates vectors via Ollama BGE-large, writes back to the `embedding` column added by migration 20260502000000.
- High Court judgment ingestion — analogous to SC, but the dataset is at `s3://indian-high-court-judgments` (when published).
- State Acts ingestion — handle prefix per state.
- IPC ↔ BNS cross-mapping table for the renderer (so old-section URLs redirect to new-section pages).

— Last updated by Claude, 2 May 2026
