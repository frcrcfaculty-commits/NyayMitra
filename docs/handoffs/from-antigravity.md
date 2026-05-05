# Handoff: Antigravity-A (Backend) → Claude & Antigravity-B

## What Was Completed (Completion Ratio: ~80%)

I have completed the backend infrastructure for Phase 1 as requested, but we are currently blocked from live end-to-end testing due to missing database credentials and RPC functions.

1. **Embeddings Generation (`scripts/generate-embeddings.mjs`)**: 
   - Reads from both `statutes` and `scenarios`.
   - Chunks text over 2000 chars into ~2000-char blocks with 200-char overlap.
   - Pushes chunks to `statute_section_chunks`.
   - Defaults to local Ollama (`bge-large` at `http://localhost:11434/api/embeddings`) with a fallback to Google Gemini (`text-embedding-004`).

2. **RAG implementation (`supabase/functions/chat/index.ts`)**:
   - `retrieveContext()` now fetches the query embedding via Ollama or cloud.
   - It queries a custom RPC `search_legal_context` to fetch the top 8 chunks (pgvector + FTS hybrid search via Reciprocal Rank Fusion).
   - Async logging to `query_logs` for `retrieved_statute_ids` and `retrieved_scenario_ids`.

3. **Statute Pages**:
   - Added `src/pages/Law.tsx` (Index of all statutes).
   - Added `src/pages/StatuteSection.tsx` (Index of sections and specific section detail view).
   - Wired routes in `src/App.tsx`.

4. **Citation Linkifier (`src/lib/citationLinkifier.ts`)**:
   - Matches valid patterns (e.g. \`BNS s.103\`, \`BNSS Section 173\`) and replaces them with standard React Router Links (e.g. \`[BNS s.103](/law/bns/103)\`).
   - Applied before markdown rendering in \`RightsDetail.tsx\`.

## What is Broken / Blocking

- **Missing Supabase Context / Migration Limits**: I did not have access to the Supabase Studio or DB credentials, so I could not apply the migrations or seed the scenarios.
- **Missing RPC Function**: The schema migrations provided by Claude did not contain the PL/pgSQL RPC function required for hybrid pgvector+FTS search. Because I do not own the migrations, I cannot commit one. The edge function \`chat/index.ts\` calls \`supabase.rpc('search_legal_context')\` which currently does not exist. 

## Requests for Hansal

1. Please run `python ingestion/statutes_ingest.py --slug bns` if you haven't already.
2. Please provide the GitHub PAT if you haven't already so the PR can be created.
3. Apply the migrations in the Supabase web UI.
4. **CRITICAL**: Run this SQL snippet in the Supabase Studio SQL Editor to unblock the edge function:
   \`\`\`sql
   CREATE OR REPLACE FUNCTION search_legal_context(query_text text, query_embedding vector(1024), match_count int)
   RETURNS TABLE (id uuid, source text, content text, source_type text) LANGUAGE plpgsql AS $$
   BEGIN
     RETURN QUERY
     WITH vector_matches AS (
       SELECT c.id, 'statute' as source_type, c.chunk_text as content, s.act_name || ' s.' || s.section as source, c.embedding <=> query_embedding as dist
       FROM statute_section_chunks c JOIN statutes s ON c.statute_id = s.id
       ORDER BY dist LIMIT match_count
     ),
     fts_matches AS (
       SELECT s.id, 'statute' as source_type, s.full_text as content, s.act_name || ' s.' || s.section as source, ts_rank_cd(s.fts, websearch_to_tsquery(query_text)) as rank
       FROM statutes s
       WHERE s.fts @@ websearch_to_tsquery(query_text)
       ORDER BY rank DESC LIMIT match_count
     )
     -- Simplified output for now (Top 8 of vector matches)
     -- Full RRF requires a larger UNION ALL, which should be done properly in a migration.
     SELECT v.id, v.source, v.content, v.source_type FROM vector_matches v LIMIT match_count;
   END;
   $$;
   \`\`\`

## Requests for Claude

1. **RPC Migration**: Please create a formal migration (`20260503...`) that defines the `search_legal_context` RPC function to perform hybrid search with Reciprocal Rank Fusion (RRF, $k=60$). The stub I provided to Hansal above only does vector search.
2. **Eval Suite**: Now that retrieval is wired up, please write the citation-discipline evaluation suite in `content/eval/` (batch Opus QA) as discussed in ADR-002.

## Requests for Antigravity-B

1. **Test Runner**: Please set up Vitest in `package.json` and uncomment the test suite in `src/lib/citationLinkifier.ts` to ensure our linkifier logic remains robust.
2. **UI Navigation**: I added `/law` but didn't modify the main Layout or Navigation header components. Please add a "Statutes" link to the global nav.
3. **Dependency**: Ensure `@supabase/supabase-js` is properly installed (it should be, but verify).

---

# Antigravity-B handoff (frontend, deployment, devtooling)

> **Note:** This section was reconstructed by Claude from a code audit on 5 May 2026 because Antigravity-B did not write a handoff in their session. The "What was done" entries are verified — I cloned the repo, ran the build/test pipeline, and inspected each file. The "What's still needed" entries are pending items from the original Antigravity-B prompt that were not delivered.

## Completion ratio: ~70%

B did the higher-stakes work (testing, observability, PWA, Vercel) and skipped the lower-stakes infrastructure items (CI workflow, Capacitor Android, PWA icons). Quality of what was delivered is high — `pnpm test` shows 21/21 passing tests, `pnpm typecheck` is clean, `pnpm build` succeeds with PWA assets generated. Three issues caught in audit are listed below.

## What was completed

### Testing (Task 2) — DONE
- `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom` added to devDependencies.
- `vite.config.ts` extended with vitest config block.
- Scripts added: `pnpm test`, `pnpm test:watch`, `pnpm test:ui`, `pnpm typecheck`.
- 21 tests across 5 files, all passing:
  - `src/components/Layout.test.tsx` (4 tests)
  - `src/components/LanguageToggle.test.tsx` (2 tests)
  - `src/i18n/i18n.test.ts` (5 tests, locale parity check across en/hi/mr)
  - `src/hooks/useDisclaimer.test.ts` (3 tests)
  - `src/lib/citationLinkifier.test.ts` (7 tests, real coverage of the linkifier patterns)
- Test infrastructure: `src/test/setup.ts`, `src/test/test-utils.tsx`.

### Observability (Task 3) — DONE
- `@sentry/react` added; initialised in `src/main.tsx` with browserTracingIntegration and tracesSampleRate of 0.1.
- App wrapped in `<Sentry.ErrorBoundary fallback={<GlobalErrorFallback />}>`.
- `plausible-tracker` added; initialised in `src/lib/analytics.ts` only when `VITE_PLAUSIBLE_DOMAIN` env var is set (privacy-respecting default).
- `src/components/GlobalErrorFallback.tsx` — friendly error UI mentioning NALSA helpline 15100, with a reload button, per the prompt's instruction that error pages shouldn't be cold "Error 500" screens for users who may be in distress.

### UI components (Task 4) — DONE
- `CitationBadge.tsx` — clickable badge for inline statute references (used in Chat).
- `DisclaimerFooter.tsx` — reusable disclaimer footer (in Layout).
- `HelplineCard.tsx` — category-aware helpline list (used in RightsDetail).
- `TriggerWarningBanner.tsx` — sensitive-content banner (used in RightsDetail; reads `trigger_warning` frontmatter).
- `Badge`, `Tooltip` shadcn primitives added.
- Components are wired into `src/pages/Chat.tsx` and `src/pages/RightsDetail.tsx`.

### PWA (Task 5) — DONE BUT BROKEN
- `vite-plugin-pwa` v1.2.0 added.
- `vite.config.ts` extended with VitePWA config: name, short_name, theme_color #059669, icons array, workbox globPatterns.
- `dist/manifest.webmanifest` is generated on build.
- `dist/sw.js` (service worker) is generated.
- ⚠️ **BUG:** `manifest.webmanifest` references `/pwa-192x192.png` and `/pwa-512x512.png`, but **these files don't exist** in `public/`. The PWA install will fail on Android/iOS until the icons are added. See "Pending" below.

### Deployment (Task 6) — DONE
- `vercel.json` added with: `cleanUrls: true`, SPA rewrites, immutable cache headers for static assets, security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection).

### Eval runner (Task 8) — PARTIAL
- `scripts/run-eval.mjs` exists, takes `--file <jsonl>` and `--url <endpoint>`, runs queries against the chat function and reports pass/fail.
- ⚠️ **Schema mismatch:** B used `expected_intent` and `expected_statutes` fields per test case, but the original prompt specified `must_cite` and `must_not_cite`. The runner is functional but Claude will need to either update the runner or align the gold-set to B's schema when authoring `content/eval/*.jsonl`. (Claude has chosen to update the runner — see the next session's commits.)
- `content/eval/` directory does not exist; this is Claude's territory to populate.

## What was NOT completed

### CI workflow (Task 7) — MISSING
`.github/workflows/ci.yml` does not exist. The prompt specified: on push and PR, run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build`, with concurrency cancellation. **Hand back to Antigravity-B (or anyone) — ~30 minutes of work.**

### Capacitor Android scaffold (Task 9) — MISSING
- `@capacitor/android` not in dependencies.
- `capacitor.config.ts` exists (B added it, with appId `com.nyaymitra.app`, name "NyayMitra").
- `android/` directory does not exist (would be created by `npx cap add android`).
- `pnpm android:build` script not in `package.json`.

**Hand back to Antigravity-B — ~30 minutes of work.**

### A's explicit request: "Statutes" link in nav — MISSING
Antigravity-A's handoff (above) explicitly asked: *"I added /law but didn't modify the main Layout or Navigation header components. Please add a 'Statutes' link to the global nav."*

`src/components/Layout.tsx` `navItems` array still contains only Home, Rights, Chat. **Hand back to Antigravity-B — 5-line edit.**

### PWA icons — MISSING
Per Task 5: "you'll need to create simple icons — a stylised 'न्या' character or a scales-of-justice glyph; use a placeholder if needed."
- `public/pwa-192x192.png` — does not exist
- `public/pwa-512x512.png` — does not exist

**Hand back to Antigravity-B (or use a generator like `pwa-asset-generator` against the existing `public/favicon.svg`) — ~15 minutes.**

## Bug fixed by Claude in this session

`pnpm-workspace.yaml` had been added to the repo with an `allowBuilds:` key but no `packages:` field. This made `pnpm install` fail for any fresh clone with the error `packages field missing or empty`. The intent (block esbuild postinstall) was already correctly expressed in `package.json`'s `pnpm.onlyBuiltDependencies`. The malformed workspace file has been deleted. Both Antigravity-A and Antigravity-B happened to have stale `node_modules` during their sessions, so neither caught it.

## Requests for the next session

For Antigravity-B (or whichever agent picks this up):

1. Add the Statutes nav link in `src/components/Layout.tsx` (the `navItems` array). 5-line edit.
2. Generate `public/pwa-192x192.png` and `public/pwa-512x512.png` from `public/favicon.svg`. The `pwa-asset-generator` npm package can do this in one command.
3. Create `.github/workflows/ci.yml` with the spec from the original prompt.
4. Run `npx cap add android`, install `@capacitor/android`, add `pnpm android:build` script.

For Hansal:

1. Apply the new migration `20260503000000_search_legal_context_rpc.sql` in Supabase Studio.
2. Apply the IVFFlat indexes once you've generated embeddings (instructions in `ingestion/README.md` and the new migration's comments).

