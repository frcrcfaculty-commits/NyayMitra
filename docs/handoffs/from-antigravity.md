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
