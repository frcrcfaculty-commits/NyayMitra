# Roadmap

> Phased, incremental build plan. Each phase has a single check-in milestone before moving to the next. The aim is to ship something useful every 2–3 weeks rather than build invisibly for 6 months.

## Phase 0 — Foundation (DONE, 2 May 2026)

| Item | Owner | Status |
|---|---|---|
| Vite + React + TypeScript scaffold | Antigravity | ✅ |
| shadcn/ui + Tailwind | Antigravity | ✅ |
| i18n (en, hi, mr) | Antigravity | ✅ |
| Layout, Home, Rights listing, RightsDetail, Chat pages | Antigravity | ✅ |
| Initial Supabase migrations (statutes, scenarios, profiles, chat) | Antigravity | ✅ |
| Initial system prompt + chat edge function | Antigravity | ✅ (replaced; see below) |
| Standing brief for Claude agent | Claude | ✅ `docs/prompts/agent-claude.md` |
| Architecture doc | Claude | ✅ `docs/ARCHITECTURE.md` |
| Compliance posture | Claude | ✅ `docs/COMPLIANCE.md` |
| LLM routing decision (ADR 002) | Claude | ✅ `docs/decisions/002-llm-routing.md` |
| Schema additions (pgvector, FTS, ingestion fields) | Claude | ✅ `supabase/migrations/20260502000000_*.sql` |
| 12 IndiaCode handle verification | Claude | ✅ `docs/corrections/001-indiacode-handles.md` |
| `statutes_ingest.py` with PDF fallback | Claude | ✅ live-tested against BNS |
| `sc_judgments_ingest.py` with V2 index | Claude | ✅ live-tested against 2023 |
| Citizen scenarios 1–15 | Claude | ✅ all 15 written |
| System prompts (Tier 1 + Tier 2) | Claude | ✅ `docs/prompts/system_prompts.md` |
| Chat edge function with tiered routing | Claude (proposed); Antigravity reviews | ✅ refactored |
| Updated seed script for richer frontmatter | Claude | ✅ `scripts/seed-scenarios.mjs` |

## Phase 1 — Single-statute MVP (~2 weeks)

**Goal:** end-to-end working for one statute (BNS) and the citizen scenarios in English.

| Item | Owner | Notes |
|---|---|---|
| Set up Supabase project (production, not local) | Hansal | |
| Apply all migrations including 20260502000000 | Antigravity | Use Supabase Studio if Docker isn't installed |
| Run `pnpm scripts/seed-scenarios.mjs` to mirror scenarios into DB | Antigravity | `pnpm install` first; uses existing `@supabase/supabase-js` dep |
| Run `python ingestion/statutes_ingest.py --slug bns` for full BNS corpus | Hansal | ~10 minutes |
| Generate embeddings for `statutes` (Ollama BGE-large) | Antigravity / Claude | Separate script TBD |
| Set `GEMINI_API_KEY` and `ANTHROPIC_API_KEY` in Supabase function secrets | Hansal | |
| Test `/chat` end-to-end against deployed edge function | Antigravity | |
| Wire `key_sections` linkification on `/rights/:slug` | Antigravity | The seed script populates `key_sections` array |
| Deploy preview to Vercel | Hansal | |

**Phase 1 success criterion:** Hansal can open `/rights/rights-during-arrest` on his phone, see the BNSS sections cited, click `/chat`, ask "what should I do if police don't give me bail papers?" and get a coherent answer that cites the right BNSS section and ends with the disclaimer.

## Phase 2 — Multi-statute Q&A (~3 weeks)

**Goal:** Q&A working across all 12 statutes with proper retrieval and citation discipline.

| Item | Owner |
|---|---|
| Run `statutes_ingest.py --all` | Hansal |
| Generate embeddings for all statute sections | Antigravity |
| Implement `retrieveContext()` in `chat/index.ts` (TODO_RETRIEVAL marker) | Antigravity |
| PII redaction edge function | Antigravity |
| Tier 0 (local Ollama) endpoint and routing | Antigravity / Hansal |
| Citation-discipline eval suite (gold-set Q&A) | Claude |
| Cost dashboard surfacing per-tier spend (reads `query_logs`) | Antigravity |

**Phase 2 success criterion:** for any of 50+ canned eval questions, the system returns an answer that (a) cites the correct BNS/BNSS/BSA section, (b) does not hallucinate any section number, (c) ends in the disclaimer, (d) costs <$0.005/query average.

## Phase 3 — Vernacular + Mobile (~2 weeks)

**Goal:** the citizen tier works in Hindi and Marathi, on Android.

| Item | Owner |
|---|---|
| Translation edge function (Gemini Flash with cached prompt) | Antigravity |
| Vernacular UI strings — already in `src/i18n/locales/` (en, hi, mr) | Antigravity |
| Capacitor build for Android | Antigravity |
| Test on low-bandwidth (3G simulation) | Antigravity / Hansal |
| App store listing prep | Hansal |

**Phase 3 success criterion:** a Hindi-speaking user on a 3G connection in a tier-3 city gets a useful answer to "मेरे अधिकार क्या हैं अगर पुलिस मुझे गिरफ्तार करे?" in under 5 seconds.

## Phase 4 — SC judgments + pro-tier preview (~3 weeks)

**Goal:** pro-tier preview accessible to invited beta users; SC judgment search live.

| Item | Owner |
|---|---|
| Run `sc_judgments_ingest.py --from 2015 --to 2025` (recent first) | Hansal |
| Judgment text extraction from PDFs | Claude / Antigravity |
| Judgment embedding + indexing | Antigravity |
| Pro-tier auth (Supabase auth + plan gate) | Antigravity |
| `/research` page with judgment search + multi-doc synthesis | Antigravity |
| Pro-tier system prompt (citation-heavy, tone shifted) | Claude |
| Beta invite flow | Hansal |

**Phase 4 success criterion:** an invited advocate can search for "POSH Act inquiry timeline supreme court" and get a synthesised summary citing 3+ relevant judgments with paragraph-level citations.

## Phase 5 — High Court corpus + scale (~4 weeks)

**Goal:** all 25 High Courts indexed; pro-tier launched publicly.

| Item | Owner |
|---|---|
| Adapt `sc_judgments_ingest.py` for HC bucket | Claude |
| HC corpus ingest (priority: Bombay, Delhi, Madras, Karnataka first) | Hansal |
| State-Acts ingestion (Maharashtra Rent Control, etc.) | Claude |
| Pricing rollout (per ADR 002: ~₹6,000+/month per pro user) | Hansal |
| Public launch comms | Hansal |

## Beyond Phase 5

- Tribunals (NCLT, NCDRC, ITAT, CAT)
- Drafting templates (notices, applications, model petitions)
- Document upload + analysis (paid only; DPDP-careful)
- Local-language pro-tier
- Open-source ingestion tooling (give back to the community)

## Risks tracked

| Risk | Mitigation |
|---|---|
| IndiaCode HTML structure changes | Per-statute strategy registry in `statutes_ingest.py` lets us patch one statute at a time |
| DPDP rule notification adds restrictions | We are already DPDP-aware; ADR 002 keeps PII on Tier 0 |
| Manupatra / SCC Online price retaliation | Our wedge is undercut by 60–80% — they cannot match without breaking their existing customer pricing |
| Bar Council of India objections under Advocates Act | We are operating clearly on the "information" side of the line; see `docs/COMPLIANCE.md`. Engage proactively with BCI if they reach out |
| Local Ollama quality drift | Tier 1 fallback catches it; eval suite detects regressions |

## Cadence

- **Weekly:** Hansal + Claude session, ~2 hours, reviewing the active phase.
- **Per phase:** explicit go/no-go check before starting the next phase.
- **Per merge to main:** the relevant agent reviews; cross-domain changes require both.

## Antigravity's known blockers (carried over from initial scaffold)

- Supabase CLI + Docker not installed locally — migrations not yet
  end-to-end verified. Workaround: apply via Supabase Studio web UI; or
  install Docker Desktop + `npm i -g supabase`.
- Node 20.18.0 — forced Vite 6 instead of 8. Workaround: upgrade Node to
  20.19+; or stay on Vite 6 (it works fine for our needs).
