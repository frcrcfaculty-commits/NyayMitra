-- Migration: Enable pgvector, add ingestion-friendly columns, FTS, and constraints.
--
-- This migration is ADDITIVE: it does not drop or rename anything from prior
-- migrations. It exists because the initial schema (20240101000000_create_statutes.sql,
-- 20240101000001_create_scenarios.sql) was scaffolded before the ingestion design
-- was finalised. The columns and indexes added here are required for:
--   - the ingestion pipelines in `ingestion/` (statute_handle, section_number_int)
--   - the RAG retrieval path described in docs/decisions/002-llm-routing.md
--     and docs/ARCHITECTURE.md (pgvector embeddings, FTS over statute text)
--   - section-level uniqueness (preventing duplicate inserts on re-run)
--
-- Authored by Claude agent, 2 May 2026. See docs/handoffs/from-claude.md.

-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS vector;        -- pgvector for embeddings
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- fuzzy text search on titles

-- ---------------------------------------------------------------------------
-- 2. statutes table: add ingestion fields, uniqueness, FTS, embeddings
-- ---------------------------------------------------------------------------

-- IndiaCode handle (e.g. "123456789/20062" for BNS). Required by the ingest
-- pipeline to fetch the act-detail page.
ALTER TABLE public.statutes
  ADD COLUMN IF NOT EXISTS statute_slug TEXT,           -- short slug: "bns", "bnss", etc.
  ADD COLUMN IF NOT EXISTS handle TEXT,                  -- IndiaCode handle
  ADD COLUMN IF NOT EXISTS act_id TEXT,                  -- IndiaCode actid for show-data calls
  ADD COLUMN IF NOT EXISTS chapter TEXT,                 -- chapter heading where this section lives
  ADD COLUMN IF NOT EXISTS section_number_int INTEGER,   -- numeric portion of section, for sort
  ADD COLUMN IF NOT EXISTS in_force_date DATE,           -- when this section came into force
  ADD COLUMN IF NOT EXISTS embedding vector(1024);       -- BGE-large class embeddings

-- Idempotency for re-runs of the ingest pipeline.
-- We dedupe on (statute_slug, section, language). statute_slug is the canonical
-- short identifier (e.g. "bns"); act_name (e.g. "The Bharatiya Nyaya Sanhita,
-- 2023") may have minor formatting drift between sources.
CREATE UNIQUE INDEX IF NOT EXISTS uq_statutes_slug_section_lang
  ON public.statutes(statute_slug, section, language)
  WHERE statute_slug IS NOT NULL;

-- Full-text search on statute text (title + description + full_text).
-- We use a generated tsvector column so the index stays in sync automatically.
ALTER TABLE public.statutes
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(full_text, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_statutes_fts
  ON public.statutes USING GIN (fts);

-- IVFFlat index for semantic search. lists=100 is a starting point; tune at
-- ~10K vectors. For now we ship without it and create it once we have data.
-- See: ingestion/README.md for "build vector index" step.
-- (Index intentionally not created here — IVFFlat needs sample data first.)

-- Trigram index for fuzzy title lookup (e.g. "BNS s.85" or "section 85 BNS")
CREATE INDEX IF NOT EXISTS idx_statutes_title_trgm
  ON public.statutes USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_statutes_handle
  ON public.statutes(handle) WHERE handle IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_statutes_slug
  ON public.statutes(statute_slug) WHERE statute_slug IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. statute_section_chunks: sub-section chunking for RAG
-- ---------------------------------------------------------------------------
-- Some sections (especially in BNSS, CPA, DPDP) are >2000 chars and benefit
-- from being broken into smaller chunks for retrieval. The parent section row
-- in `statutes` stays canonical; chunks are derived for retrieval only.

CREATE TABLE IF NOT EXISTS public.statute_section_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statute_id UUID NOT NULL REFERENCES public.statutes(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,                  -- 0-based ordinal within the parent
  chunk_text TEXT NOT NULL,
  embedding vector(1024),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(statute_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_statute
  ON public.statute_section_chunks(statute_id);

ALTER TABLE public.statute_section_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Chunks are publicly readable"
  ON public.statute_section_chunks FOR SELECT USING (true);
CREATE POLICY "Only admins can modify chunks"
  ON public.statute_section_chunks FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

-- ---------------------------------------------------------------------------
-- 4. scenarios table: add embedding + scenario-level FTS, key_sections array
-- ---------------------------------------------------------------------------

ALTER TABLE public.scenarios
  ADD COLUMN IF NOT EXISTS key_sections TEXT[] DEFAULT '{}',  -- ["BNS s.85", "BNSS s.480"]
  ADD COLUMN IF NOT EXISTS primary_statute TEXT,              -- short slug
  ADD COLUMN IF NOT EXISTS audience TEXT DEFAULT 'citizen',   -- citizen | professional
  ADD COLUMN IF NOT EXISTS trigger_warning TEXT,
  ADD COLUMN IF NOT EXISTS in_force_note TEXT,
  ADD COLUMN IF NOT EXISTS last_reviewed DATE,
  ADD COLUMN IF NOT EXISTS embedding vector(1024);

ALTER TABLE public.scenarios
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_scenarios_fts
  ON public.scenarios USING GIN (fts);

CREATE INDEX IF NOT EXISTS idx_scenarios_audience
  ON public.scenarios(audience);

CREATE INDEX IF NOT EXISTS idx_scenarios_primary_statute
  ON public.scenarios(primary_statute) WHERE primary_statute IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. query_logs: drives the cost dashboard described in ADR 002
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.query_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id UUID REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
  query_text TEXT NOT NULL,
  detected_language TEXT,
  intent TEXT,                                   -- rights / how-to / definition / case-lookup / other
  domain TEXT,                                   -- criminal / civic / family / consumer / etc.
  contains_pii BOOLEAN DEFAULT false,
  tier TEXT NOT NULL,                            -- 'tier_0_local' | 'tier_1_gemini' | 'tier_2_claude'
  model TEXT,                                    -- specific model used: 'gemma3:12b', 'gemini-2.5-flash', etc.
  retrieved_statute_ids UUID[] DEFAULT '{}',
  retrieved_scenario_ids UUID[] DEFAULT '{}',
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cached_tokens INTEGER,
  cost_usd NUMERIC(10, 6),
  latency_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_query_logs_user ON public.query_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_query_logs_created ON public.query_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_logs_tier ON public.query_logs(tier);

ALTER TABLE public.query_logs ENABLE ROW LEVEL SECURITY;
-- Users can read their own query logs
CREATE POLICY "Users can read their own query logs"
  ON public.query_logs FOR SELECT
  USING (auth.uid() = user_id);
-- Edge functions write logs via service role; no public insert.

COMMENT ON TABLE public.query_logs IS
  'Per-query telemetry for cost monitoring (ADR 002). Sensitive: query_text may contain PII even though we redact before model egress; retain only as long as needed for analytics.';

-- ---------------------------------------------------------------------------
-- 6. updated_at trigger for tables that have updated_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_statutes_updated_at') THEN
    CREATE TRIGGER tg_statutes_updated_at
      BEFORE UPDATE ON public.statutes
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_scenarios_updated_at') THEN
    CREATE TRIGGER tg_scenarios_updated_at
      BEFORE UPDATE ON public.scenarios
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_profiles_updated_at') THEN
    CREATE TRIGGER tg_profiles_updated_at
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_chat_sessions_updated_at') THEN
    CREATE TRIGGER tg_chat_sessions_updated_at
      BEFORE UPDATE ON public.chat_sessions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
