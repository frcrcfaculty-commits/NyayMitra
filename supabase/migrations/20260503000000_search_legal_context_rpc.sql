-- Migration: search_legal_context() — hybrid retrieval RPC for the chat function.
--
-- BACKGROUND
-- The edge function in supabase/functions/chat/index.ts calls
--   supabase.rpc('search_legal_context', { query_text, query_embedding, match_count })
-- expecting back rows of (id, source, content, source_type).
-- Antigravity-A wrote the call site but, by ownership rules, could not write
-- the migration. This migration defines the function properly: a hybrid of
-- pgvector cosine similarity and tsvector FTS, fused via Reciprocal Rank
-- Fusion (RRF, k = 60).
--
-- INPUT CONTRACT (must match what chat/index.ts sends)
--   query_text       TEXT      — the user's natural-language query
--   query_embedding  TEXT      — JSON-stringified 1024-dim vector (this is
--                                what supabase-js sends for vector params;
--                                we cast it to vector(1024) inside)
--   match_count      INT       — how many top results to return (typically 8)
--
-- OUTPUT CONTRACT (must match what chat/index.ts consumes)
--   id          UUID    — for source_type='statute', this is statutes.id;
--                         for source_type='scenario', this is scenarios.id.
--                         The downstream code uses these to populate
--                         query_logs.retrieved_{statute,scenario}_ids.
--   source      TEXT    — short human-readable label like "BNS s.85" or
--                         "scenario: how-to-file-rti".
--   content     TEXT    — the text the LLM should ground on. For statutes
--                         we return the chunk text where the chunk hit (or
--                         the section body otherwise). For scenarios we
--                         return the summary plus the first ~1500 chars
--                         of content.
--   source_type TEXT    — 'statute' | 'scenario'
--
-- HOW IT WORKS
-- Four ranked candidate streams are produced, each capped at 4 × match_count
-- raw rows so RRF has enough material to rerank:
--
--   1. STATUTE_VECTOR — cosine similarity of `query_embedding` against
--      statute_section_chunks.embedding, grouped to the parent statute_id
--      (we keep the best-ranked chunk per statute as the "winning" chunk).
--   2. STATUTE_FTS — websearch_to_tsquery against statutes.fts, ranked by
--      ts_rank_cd (which honours weighted setweight() positions in the
--      generated fts column).
--   3. SCENARIO_VECTOR — cosine similarity against scenarios.embedding.
--   4. SCENARIO_FTS — websearch_to_tsquery against scenarios.fts.
--
-- For each stream, rank is the row_number() in that stream's ordering. The
-- RRF score for an (id, source_type) item is the SUM over streams of
-- 1.0 / (60 + rank). Items missing from a stream contribute 0.
--
-- We then ORDER BY total RRF score DESC and LIMIT match_count.
--
-- WHY RRF (and not weighted score blending)
-- RRF is robust to score-distribution differences between vector cosine
-- distance (typically 0..2) and ts_rank_cd (typically 0..0.5+), without
-- needing per-corpus normalisation. k=60 is the value from the original
-- Cormack et al. 2009 paper and is the de-facto default. We can tune later.
--
-- PERFORMANCE NOTES
-- - The IVFFlat indexes on the *.embedding columns are required for this
--   to be sub-second. They aren't created in 20260502000000 because pgvector
--   prefers the index be built after data exists. Build them with:
--     CREATE INDEX idx_statutes_embedding
--       ON public.statutes USING ivfflat (embedding vector_cosine_ops)
--       WITH (lists = 100);
--   (similar for scenarios and statute_section_chunks; see ingestion/README.md)
-- - The function is STABLE (deterministic for given inputs within a tx).
-- - It uses SECURITY INVOKER so RLS policies on the source tables apply.

CREATE OR REPLACE FUNCTION public.search_legal_context(
  query_text TEXT,
  query_embedding TEXT,    -- JSON-stringified vector(1024); cast inside
  match_count INT
)
RETURNS TABLE (
  id UUID,
  source TEXT,
  content TEXT,
  source_type TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  query_vec vector(1024);
  fts_query tsquery;
  candidate_pool INT;
  rrf_k CONSTANT INT := 60;
BEGIN
  -- Validate and cast the embedding. supabase-js sends vectors as JSON
  -- strings; we cast to vector here so the function signature is friendly
  -- to any client.
  BEGIN
    query_vec := query_embedding::vector(1024);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'search_legal_context: query_embedding must be a JSON-stringified vector(1024)';
  END;

  -- Build the FTS query. websearch_to_tsquery handles natural-language
  -- queries with quotes, OR, and stop words gracefully — much safer than
  -- to_tsquery for user input.
  fts_query := websearch_to_tsquery('english', coalesce(query_text, ''));

  -- Pull 4× match_count from each stream so RRF has enough breadth.
  candidate_pool := GREATEST(match_count * 4, 32);

  RETURN QUERY
  WITH
  -- ---- Stream 1: statute chunks via vector similarity, grouped to parent statute ----
  statute_vec_chunks AS (
    SELECT
      c.statute_id,
      c.chunk_text,
      ROW_NUMBER() OVER (ORDER BY c.embedding <=> query_vec) AS chunk_rank,
      c.embedding <=> query_vec AS dist
    FROM public.statute_section_chunks c
    WHERE c.embedding IS NOT NULL
    ORDER BY c.embedding <=> query_vec
    LIMIT candidate_pool * 2     -- many chunks may share a parent; over-fetch
  ),
  statute_vec AS (
    -- For each parent statute, keep the best-ranking chunk only.
    SELECT DISTINCT ON (svc.statute_id)
      svc.statute_id,
      svc.chunk_text,
      svc.dist,
      svc.chunk_rank
    FROM statute_vec_chunks svc
    ORDER BY svc.statute_id, svc.dist
  ),
  statute_vec_ranked AS (
    SELECT
      sv.statute_id AS hit_id,
      'statute'::text AS hit_type,
      sv.chunk_text AS hit_content,
      ROW_NUMBER() OVER (ORDER BY sv.dist) AS rrf_rank
    FROM statute_vec sv
    LIMIT candidate_pool
  ),

  -- ---- Stream 2: statute FTS over title + description + full_text ----
  statute_fts_ranked AS (
    SELECT
      s.id AS hit_id,
      'statute'::text AS hit_type,
      coalesce(s.full_text, s.description, s.title) AS hit_content,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(s.fts, fts_query) DESC) AS rrf_rank
    FROM public.statutes s
    WHERE s.fts @@ fts_query
    ORDER BY ts_rank_cd(s.fts, fts_query) DESC
    LIMIT candidate_pool
  ),

  -- ---- Stream 3: scenario vector similarity ----
  scenario_vec_ranked AS (
    SELECT
      sc.id AS hit_id,
      'scenario'::text AS hit_type,
      -- For scenarios we include summary + a chunk of content for grounding.
      -- Cap at ~2000 chars; the chat function will further trim to fit budget.
      coalesce(sc.summary || E'\n\n' || left(sc.content, 1800), sc.summary, '') AS hit_content,
      ROW_NUMBER() OVER (ORDER BY sc.embedding <=> query_vec) AS rrf_rank
    FROM public.scenarios sc
    WHERE sc.embedding IS NOT NULL AND coalesce(sc.is_published, true) = true
    ORDER BY sc.embedding <=> query_vec
    LIMIT candidate_pool
  ),

  -- ---- Stream 4: scenario FTS ----
  scenario_fts_ranked AS (
    SELECT
      sc.id AS hit_id,
      'scenario'::text AS hit_type,
      coalesce(sc.summary || E'\n\n' || left(sc.content, 1800), sc.summary, '') AS hit_content,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(sc.fts, fts_query) DESC) AS rrf_rank
    FROM public.scenarios sc
    WHERE sc.fts @@ fts_query AND coalesce(sc.is_published, true) = true
    ORDER BY ts_rank_cd(sc.fts, fts_query) DESC
    LIMIT candidate_pool
  ),

  -- ---- RRF fusion: union all streams, sum 1/(k+rank) per (id, type) ----
  fused AS (
    SELECT hit_id, hit_type, hit_content, rrf_rank FROM statute_vec_ranked
    UNION ALL
    SELECT hit_id, hit_type, hit_content, rrf_rank FROM statute_fts_ranked
    UNION ALL
    SELECT hit_id, hit_type, hit_content, rrf_rank FROM scenario_vec_ranked
    UNION ALL
    SELECT hit_id, hit_type, hit_content, rrf_rank FROM scenario_fts_ranked
  ),
  scored AS (
    SELECT
      f.hit_id,
      f.hit_type,
      -- Pick the longest non-empty content variant for this (id, type)
      -- across the streams that produced it. Vector hits return chunk text;
      -- FTS hits may return full_text; we want the richest grounding.
      (ARRAY_AGG(f.hit_content ORDER BY length(coalesce(f.hit_content, '')) DESC))[1] AS best_content,
      SUM(1.0 / (rrf_k + f.rrf_rank)) AS rrf_score
    FROM fused f
    GROUP BY f.hit_id, f.hit_type
  ),

  -- ---- Top N with human-readable source labels ----
  top_n AS (
    SELECT s.hit_id, s.hit_type, s.best_content, s.rrf_score
    FROM scored s
    ORDER BY s.rrf_score DESC
    LIMIT match_count
  )

  SELECT
    t.hit_id AS id,
    CASE
      WHEN t.hit_type = 'statute' THEN
        coalesce(
          UPPER(st.statute_slug) || ' s.' || st.section,
          st.act_name || ' s.' || st.section
        )
      WHEN t.hit_type = 'scenario' THEN
        'scenario: ' || sc.slug
      ELSE 'unknown'
    END AS source,
    t.best_content AS content,
    t.hit_type AS source_type
  FROM top_n t
  LEFT JOIN public.statutes  st ON t.hit_type = 'statute'  AND st.id = t.hit_id
  LEFT JOIN public.scenarios sc ON t.hit_type = 'scenario' AND sc.id = t.hit_id
  ORDER BY t.rrf_score DESC;

END;
$$;

COMMENT ON FUNCTION public.search_legal_context(TEXT, TEXT, INT) IS
'Hybrid (pgvector + FTS) retrieval with Reciprocal Rank Fusion. Called from
the chat edge function. See migration file for the full input/output contract.';

-- Permissions: anon and authenticated can call this; service_role implicit.
GRANT EXECUTE ON FUNCTION public.search_legal_context(TEXT, TEXT, INT) TO anon, authenticated;
