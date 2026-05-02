-- Migration: Create statutes table
-- Stores Indian legal statutes (IPC, CrPC, BNS, BNSS, etc.)

CREATE TABLE IF NOT EXISTS public.statutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  act_name TEXT NOT NULL,
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  full_text TEXT,
  act_year INTEGER,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  superseded_by UUID REFERENCES public.statutes(id),
  language TEXT DEFAULT 'en',
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_statutes_act ON public.statutes(act_name);
CREATE INDEX idx_statutes_category ON public.statutes(category);
CREATE INDEX idx_statutes_language ON public.statutes(language);

-- RLS
ALTER TABLE public.statutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Statutes are publicly readable"
  ON public.statutes FOR SELECT
  USING (true);

CREATE POLICY "Only admins can modify statutes"
  ON public.statutes FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

-- Comments
COMMENT ON TABLE public.statutes IS 'Indian legal statutes — IPC, CrPC, BNS, BNSS, IT Act, Consumer Protection Act, etc.';
