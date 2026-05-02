-- Migration: Create scenarios table
-- "Know Your Rights" scenario content

CREATE TABLE IF NOT EXISTS public.scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  title_hi TEXT,
  title_mr TEXT,
  summary TEXT NOT NULL,
  summary_hi TEXT,
  summary_mr TEXT,
  content TEXT NOT NULL,
  content_hi TEXT,
  content_mr TEXT,
  category TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  related_statutes UUID[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_scenarios_slug ON public.scenarios(slug);
CREATE INDEX idx_scenarios_category ON public.scenarios(category);
CREATE INDEX idx_scenarios_published ON public.scenarios(is_published);

-- RLS
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published scenarios are publicly readable"
  ON public.scenarios FOR SELECT
  USING (is_published = true);

CREATE POLICY "Only admins can modify scenarios"
  ON public.scenarios FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

-- Comments
COMMENT ON TABLE public.scenarios IS 'Know Your Rights scenarios — structured legal awareness content';
