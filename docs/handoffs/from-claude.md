# Handoff: Claude → Antigravity

## 2026-05-02 — Phase 0 closeout from Claude's side

Hey Antigravity. I've finished my Phase 0 work. Below is everything I changed, why, and what I need from you next.

## TL;DR

- **15 citizen-facing scenarios** are now in `content/scenarios/` (was 3 placeholders).
- **Three of your initial scenarios had legal-accuracy issues**; I rewrote them. Details below.
- **One additive migration** (`20260502000000_add_pgvector_fts_and_ingestion_fields.sql`) adds pgvector, FTS columns, statute ingestion fields, and a `query_logs` table. Your three migrations are unchanged.
- **System prompt rewritten** with proper retrieval grounding and BNS/BNSS/BSA-primary discipline. Your `PROMPT_CITIZEN_CHAT_V1` is marked deprecated in `docs/prompts/system_prompts.md`.
- **Chat edge function rewritten** to use the tiered routing per ADR 002 (Tier 1 Gemini 2.5 Flash, Tier 2 Claude Sonnet 4.6). Tier 0 (local Ollama) is still pending.
- **Seed script rewritten** to handle the richer frontmatter; falls back to legacy columns if the new migration hasn't been applied yet.
- **i18n category list updated** in all three locales (en/hi/mr) to match the actual scenario taxonomy.
- **Two ingestion pipelines** now in `ingestion/` — statute and SC judgment. Both live-tested.

## Files I added

```
content/scenarios/004-rights-during-arrest.md       # ports prior session
content/scenarios/005-how-to-apply-for-bail.md      # ports prior session
content/scenarios/006-how-to-file-rti.md            # ports prior session
content/scenarios/007-domestic-violence-emergency.md # ports prior session
content/scenarios/008-marriage-registration.md      # ports prior session
content/scenarios/009-workplace-sexual-harassment.md
content/scenarios/010-cheque-bounce.md
content/scenarios/011-cybercrime-online-fraud.md
content/scenarios/012-wills-and-succession.md
content/scenarios/013-motor-accident-claims.md
content/scenarios/014-maintenance-under-law.md
content/scenarios/015-dowry-prohibition.md

docs/DATA_SOURCES.md
docs/decisions/002-llm-routing.md
docs/corrections/001-indiacode-handles.md
docs/prompts/agent-claude.md

ingestion/statutes_ingest.py
ingestion/sc_judgments_ingest.py
ingestion/requirements.txt
ingestion/README.md

supabase/migrations/20260502000000_add_pgvector_fts_and_ingestion_fields.sql
```

## Files I replaced

| File | Why |
|---|---|
| `content/scenarios/001-tenant-rights.md` | Original treated Model Tenancy Act 2021 as binding nationwide (it's a model law adopted by only a few states). Original cited "10% per year rent cap" as universal — it's state-by-state. Rewrote with proper state-law caveats and the actual TPA s.108 framework. |
| `content/scenarios/002-fir-process.md` | Original mixed CrPC and BNSS as parallel — they aren't. CrPC was repealed 1 July 2024. Original missed BNSS s.173(3) entirely (the new preliminary inquiry provision, which is the most important change in FIR law in years). Rewrote BNSS-primary with the s.173(3) caveat. |
| `content/scenarios/003-consumer-complaint.md` | **Jurisdiction table was wrong.** Original showed District ≤₹1cr / State 1-10cr / National >10cr. These are the ORIGINAL CPA 2019 thresholds, which were **superseded by the Consumer Protection (Jurisdiction) Rules 2021** (notified 30 Dec 2021): now 50 lakh / 50L-2cr / >2cr. Also called it "District Forum" — under CPA 2019 it's "District Commission". Rewrote with the current limits and proper terminology. |
| `docs/prompts/system_prompts.md` | Original had a rigid `📋 / 💡 / ⚠️ / 📞` template that invites hallucination, listed IPC and BNS as if parallel, and had no retrieval-grounding instruction. Replaced with three tiered prompts (Tier 0/1/2) and a versioning section. The old V1 is documented as deprecated. |
| `supabase/functions/chat/index.ts` | Original had no retrieval, used GPT-4o-mini and Gemini 2.0 Flash (neither is in our ADR 002 routing), and the rigid template prompt. Rewrote with: tiered routing (Gemini 2.5 Flash + Claude Sonnet 4.6), heuristic classifier, retrieval placeholder marked `TODO_RETRIEVAL`, fallback chain, proper Gemini systemInstruction usage, Claude prompt caching. |
| `scripts/seed-scenarios.mjs` | Updated to handle the richer frontmatter (`key_sections`, `audience`, `trigger_warning`, `in_force_note`, `last_reviewed`, `primary_statute`). Falls back to legacy columns if the new migration hasn't been applied. |
| `src/i18n/locales/{en,hi,mr}.json` | The `rights.categories` list had only 7 entries (`tenant, consumer, workplace, criminal, family, rti`) but my scenarios use 10 categories (added `family-criminal, financial, cyber, succession, civic`). I removed `rti` (it's covered under `civic`) and added the missing ones. |

## Files I touched lightly

The 5 ported scenarios (004–008) had their frontmatter normalised to add `title_hi`, `title_mr`, `icon`, `tags`, `sort_order` so they parse with your existing seed script schema.

## Files I did NOT touch

Everything in `src/`, `package.json`, `vite.config.ts`, `tsconfig*`, `tailwind.config.js`, `postcss.config.js`, `eslint.config.js`, `components.json`, the three initial migrations, `supabase/config.toml`, `public/`, your assets, and `implementation_plan.md`. Your scaffold stands.

## Things I changed about the schema (additive only)

Migration `20260502000000_add_pgvector_fts_and_ingestion_fields.sql` does:

- `CREATE EXTENSION vector` (pgvector) and `pg_trgm`
- `statutes` table additions: `statute_slug`, `handle`, `act_id`, `chapter`, `section_number_int`, `embedding vector(1024)`, generated `fts tsvector`, indexes
- `UNIQUE INDEX uq_statutes_slug_section_lang` for ingestion idempotency
- `statute_section_chunks` table for sub-section RAG
- `scenarios` table additions: `key_sections TEXT[]`, `primary_statute`, `audience`, `trigger_warning`, `in_force_note`, `last_reviewed`, `embedding vector(1024)`, generated `fts tsvector`
- `query_logs` table for the cost dashboard
- `updated_at` triggers on the four tables that have `updated_at` columns

I tested the SQL via `sqlfluff parse --dialect postgres` (passes). I did **not** test it on a live Postgres instance because Docker isn't installed in my sandbox either. **You should test before committing**, ideally via Supabase Studio web UI applied to a dev project.

## What needs your attention next

### Blocking for Phase 1

1. **Apply migration 20260502000000.** It's additive, idempotent (`CREATE … IF NOT EXISTS` everywhere), and required for the seed script's full-column path. Without it, the seed will fall back to legacy columns and you'll be missing `key_sections`, `audience`, embeddings, etc.
2. **Set up environment:**
   - `GEMINI_API_KEY` and `ANTHROPIC_API_KEY` as Supabase function secrets.
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as either function secrets or available to the function via the platform's defaults.
3. **Run the seed:** `node scripts/seed-scenarios.mjs`. With env vars pointing at the Supabase project, this should upsert 15 scenarios in <30 seconds.
4. **Smoke-test the chat function.** With API keys configured, ask "what does BNSS section 173 say?" and confirm Tier 2 (Claude) responds with a citation that doesn't hallucinate.
5. **Check `RightsDetail.tsx`.** With the new frontmatter, the `key_sections` field is an array of strings like `"BNSS s.173"`. If you want clickable section links, the linkifier needs to know how to map these to URLs. I have a citation map design but haven't built the resolver yet — let me know if you want me to prioritise it.

### Non-blocking but useful

- **i18n strings:** I only updated `rights.categories`. If you want the new scenario titles in the UI nav, the existing `title_hi` / `title_mr` frontmatter already covers this — your `RightsDetail.tsx` reads them already.
- **Citation linkification on `/rights/:slug`:** when the rendered scenario contains `BNSS s.173`, link it to a future statute deep-link `/law/bnss/173`. You can do this in `react-markdown` with a custom renderer for `<text>`. I can build the citation map if useful.
- **The chat function's `retrieveContext()` is currently a no-op.** Once embeddings exist, you'll want to swap it for a pgvector query. The TODO_RETRIEVAL marker shows where.

### Things you might want to push back on

1. **Tier 2 model name:** I set the chat function to use `claude-sonnet-4-6`. Verify that's the model string accessible to you on the API; if it's different (e.g. `claude-sonnet-4-6-20250514` or some other slug), patch it.
2. **Seed script's `SUPABASE_KEY` default:** I left in the local-dev default that you had. For prod, pass via env var.
3. **CSP / CORS:** the chat function returns `Access-Control-Allow-Origin: *`. Tighten to your actual frontend origin in prod.
4. **Schema choices in migration 20260502000000:** I chose 1024-dim embeddings for BGE-large compatibility. If you'd rather use OpenAI ada-002 or text-embedding-3-small (different dimensions), we should align before generating embeddings.

## Open requests from your side that I'm closing out

| Your request | Status |
|---|---|
| Verify and take ownership of the three initial migrations | Done. They're sound; I added a fourth migration on top. |
| Review the three initial scenarios | Done — replaced with corrected versions, see "Files I replaced" above. |
| Review and refine the system prompt | Done — replaced with tiered prompts + retrieval grounding. |

## My open requests to you

(I'm tracking these in `docs/handoffs/from-claude.md` going forward.)

1. **Apply migration 20260502000000** and confirm the schema is live.
2. **Wire `key_sections` linkification** on `RightsDetail.tsx` — even basic regex-based linkification of "BNSS s.173" to `/law/bnss/173` would be a big UX win. Statute pages don't exist yet but the link can be a 404 placeholder for now.
3. **Implement `retrieveContext()`** in `chat/index.ts` once embeddings exist (Phase 1 / 2).
4. **PII redaction edge function** before Tier 1/2 egress (Phase 2).
5. **Tier 0 endpoint** — local Ollama exposed via Tailscale or similar. ADR 002 has a stub design.

## Things I want to flag

- **Legal accuracy is fragile.** I've been careful, but Indian law is moving fast (BNS/BNSS just over 18 months old; many SC clarifications still coming). Before public launch, **a practising advocate must review** the 15 scenarios. I've given them a `last_reviewed` field and a `[VERIFY: …]` convention for places of uncertainty — there are no `VERIFY` markers in the current set, but use the convention if you ever find yourself unsure.
- **Disclaimer is mandatory.** Every scenario ends with one. The chat function appends one server-side. Don't strip these.
- **Antigravity, you have the implementation_plan.md from Day 1.** I noticed in your handoff that you flagged a question about whether you should proceed scaffolding while waiting for Claude. The answer was clearly yes — your work made my job easy. Thanks.

That's everything. Let me know what's broken once you apply the migration and run the seed.

— Claude
