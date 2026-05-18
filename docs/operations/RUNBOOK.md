# NyayMitra Production Deployment Runbook

> **Audience:** Hansal. This is the exact sequence of manual steps to take the project from "code on GitHub" to "live URL serving real users on the internet." Roughly 60-90 minutes if everything goes smoothly.
>
> **Why this isn't automated:** every step in this runbook requires authentication AS YOU (Supabase login, Vercel OAuth, API key generation, Play Store eventually). No AI agent can do these on your behalf — not because it's hard to write, but because the credentials are yours and they would live in agent transcripts forever if pasted. You do these once.

## Prerequisites — accounts you need (free tiers are fine for MVP)

| Service | URL | Why |
|---|---|---|
| Supabase | https://supabase.com/dashboard | Database + edge functions + auth |
| Google AI Studio | https://aistudio.google.com/app/apikey | Gemini API (Tier 1 model + embeddings) |
| Anthropic Console | https://console.anthropic.com/settings/keys | Claude API (Tier 2 model) |
| Vercel | https://vercel.com/new | Frontend hosting + CDN |
| Sentry (optional) | https://sentry.io | Error tracking |
| Plausible (optional) | https://plausible.io | Privacy-friendly analytics |

You probably have most of these. Create whatever you don't have. Total time: 15 min, one-time.

---

## Phase 1 — Supabase project (~20 min)

### 1.1 Create the project

1. Go to https://supabase.com/dashboard
2. New project → name `nyaymitra-prod` → choose a region (Mumbai/Singapore for India users)
3. Set a strong database password and save it
4. Wait ~2 minutes for provisioning

### 1.2 Copy the credentials

From Project Settings → API, copy and save (you'll paste these into multiple places below):

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...   (the public anon key)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...   (the powerful service key — server-side only)
```

### 1.3 Apply all 5 migrations

Go to SQL Editor in Supabase Studio. Run each of these files **one at a time**, in order (copy the entire file content into the SQL Editor and click Run):

```
supabase/migrations/20240101000000_create_statutes.sql
supabase/migrations/20240101000001_create_scenarios.sql
supabase/migrations/20240101000002_create_profiles_and_chat.sql
supabase/migrations/20260502000000_add_pgvector_fts_and_ingestion_fields.sql
supabase/migrations/20260503000000_search_legal_context_rpc.sql
```

**Don't run them all at once — run, verify, then run the next.**

After each, verify:

```sql
-- After migration 4:
SELECT extname FROM pg_extension WHERE extname IN ('vector', 'pg_trgm');
-- Should return 2 rows.

SELECT column_name FROM information_schema.columns
WHERE table_name = 'statutes' AND column_name IN ('embedding','fts','statute_slug');
-- Should return 3 rows.

-- After migration 5:
SELECT proname FROM pg_proc WHERE proname = 'search_legal_context';
-- Should return 1 row.
```

### 1.4 Set Edge Function secrets

Project Settings → Edge Functions → Secrets. Add:

| Name | Value |
|---|---|
| `GEMINI_API_KEY` | from Google AI Studio |
| `ANTHROPIC_API_KEY` | from Anthropic Console |

`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are automatically available to edge functions; you don't need to set them.

---

## Phase 2 — Seed the database (~10 min)

This needs to run on a machine with Node 20+ and network access to Supabase. Your i9 desktop or Mac both work.

```bash
git clone https://github.com/frcrcfaculty-commits/NyayMitra.git
cd NyayMitra
pnpm install --frozen-lockfile

export SUPABASE_URL='https://<project-ref>.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='eyJhbGc...'   # the service role one

node scripts/seed-scenarios.mjs
```

Expected output: `15 ok, 0 failed`. Verify in Supabase Studio SQL editor:

```sql
SELECT slug, category, length(content) AS chars FROM scenarios ORDER BY sort_order;
-- 15 rows, content lengths 5000-15000 chars
```

---

## Phase 3 — Ingest statutes (~30-45 min, mostly waiting)

This pulls statute text from IndiaCode. Throttled to 1 request/sec to be polite.

```bash
cd ingestion
python3 -m venv venv
source venv/bin/activate    # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt

python statutes_ingest.py --all
```

This takes 30-45 minutes. Let it run. If a single statute fails (typically IndiaCode HTML changes), it logs the failure and continues with the rest.

Verify:

```sql
SELECT statute_slug, count(*) AS n FROM statutes
WHERE statute_slug IS NOT NULL
GROUP BY statute_slug ORDER BY statute_slug;
```

Expected approximate counts (minor variation OK):
- `bns: 358`, `bnss: 531`, `bsa: 170`, `cpa: 107`, `constitution: 395+`
- `dpdp: 44`, `dv: 37`, `hma: 30`, `ica: 266`, `mv: 217`, `rti: 31`, `sma: 51`

If any statute has 0 rows, note it and re-run just that one: `python statutes_ingest.py --slug bnss`.

---

## Phase 4 — Generate embeddings (~30-60 min)

The schema expects 1024-dimension vectors. Pick **one** of these paths.

### Path A — Gemini cloud embeddings (recommended for now)

Cleanest because the edge function defaults to this too, so query-time and corpus-time embeddings come from the same model.

```bash
export SUPABASE_URL='https://<project-ref>.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='eyJhbGc...'
export GEMINI_API_KEY='AIza...'

# Smoke test first — just the 15 scenarios
node scripts/generate-embeddings.mjs --provider gemini --table scenarios

# Then a small statute slice
node scripts/generate-embeddings.mjs --provider gemini --table statutes --limit 20

# Then the rest
node scripts/generate-embeddings.mjs --provider gemini --table all
```

Cost: very low. Gemini embeddings are roughly $0.025 per million characters; the whole corpus is well under 10M characters. Expect total cost under $0.50 USD.

### Path B — Local Ollama on your M3 Max

Requires more setup but keeps embeddings local.

1. On your Mac: `ollama serve` running, `ollama pull bge-large`
2. Make it reachable from the machine running the script:
   - If running on the same Mac: nothing to do, just use defaults
   - If running on the i9: install Tailscale on both, get the Mac's Tailscale IP, set `OLLAMA_URL=http://<mac-tailscale-ip>:11434`

```bash
node scripts/generate-embeddings.mjs --provider ollama --table all
```

This will be slower (single-threaded on your Mac's GPU) but free.

### Verify embeddings landed

```sql
SELECT count(*) FROM scenarios WHERE embedding IS NOT NULL;       -- 15
SELECT count(*) FROM statutes WHERE embedding IS NOT NULL;        -- 2200+
SELECT count(*) FROM statute_section_chunks WHERE embedding IS NOT NULL;  -- depends on chunking
```

### Build the IVFFlat indexes

ONLY after embeddings exist. In Supabase Studio SQL Editor:

```sql
CREATE INDEX IF NOT EXISTS idx_statutes_embedding
  ON public.statutes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_scenarios_embedding
  ON public.scenarios USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);

CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON public.statute_section_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

ANALYZE public.statutes;
ANALYZE public.scenarios;
ANALYZE public.statute_section_chunks;
```

---

## Phase 5 — Deploy the chat edge function (~10 min)

You'll need the Supabase CLI.

```bash
npm install -g supabase
supabase login                  # opens a browser, you authenticate
supabase link --project-ref <project-ref>   # from your Supabase URL
supabase functions deploy chat
```

That command pushes `supabase/functions/chat/index.ts` to Supabase.

### Smoke-test the deployed function

```bash
curl -X POST \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  https://<project-ref>.supabase.co/functions/v1/chat \
  -d '{"message":"What does BNSS section 173 say about FIR?","history":[]}'
```

Expected: a streaming response (Server-Sent Events) that:
- Cites BNSS s.173 (because we retrieved it from the corpus)
- Ends with the standard disclaimer
- Mentions NALSA 15100 or similar

If the response is generic and doesn't cite BNSS, retrieval isn't working. Check `query_logs`:

```sql
SELECT query_text, retrieved_statute_ids, retrieved_scenario_ids, latency_ms
FROM query_logs ORDER BY created_at DESC LIMIT 5;
```

If `retrieved_*_ids` arrays are empty, the issue is one of:
1. Embedding dimensions don't match (the schema is 1024)
2. The RPC function isn't reachable (Phase 1.3 not done)
3. The `GEMINI_API_KEY` secret isn't set in edge function secrets (Phase 1.4)

---

## Phase 6 — Deploy frontend to Vercel (~10 min)

### 6.1 Connect the repo

1. Go to https://vercel.com/new
2. Import `frcrcfaculty-commits/NyayMitra`
3. Framework preset: **Vite**
4. Build command: `pnpm build` (default is fine)
5. Output directory: `dist`
6. Install command: `pnpm install --frozen-lockfile`

### 6.2 Set environment variables in Vercel

In the project's Environment Variables section, add:

| Name | Value | Environments |
|---|---|---|
| `VITE_SUPABASE_URL` | your SUPABASE_URL | Production + Preview |
| `VITE_SUPABASE_ANON_KEY` | your SUPABASE_ANON_KEY (NOT service role!) | Production + Preview |

Do NOT add the service role key here. That stays server-side only.

Optional (only if you set up these accounts):
- `VITE_SENTRY_DSN` — from your Sentry project
- `VITE_PLAUSIBLE_DOMAIN` — your domain

### 6.3 Deploy

Click Deploy. After ~2 minutes you'll have a URL like `nyaymitra-<hash>.vercel.app`.

---

## Phase 7 — Run the eval baseline (~5 min)

This is the only objective measure of whether the system actually works.

```bash
export SUPABASE_ANON_KEY='eyJhbGc...'

node scripts/run-eval.mjs \
  --file content/eval/citizen.jsonl \
  --url https://<project-ref>.supabase.co/functions/v1/chat \
  --threshold 0.5
```

You should see something like:
```
[1/50] fir-001                          ✅ 1820ms
[2/50] fir-002                          ✅ 1654ms
[3/50] fir-003                          ❌ 2103ms — missing citation: BNSS s.175
...
=== Summary ===
Pass: 32/50 (64.0%)
Avg latency: 1873ms
```

**Realistic expectations for a first run: 40-70% pass.** Anything in that range tells us retrieval is working and the model is mostly citing correctly. Below 20% means something is fundamentally broken (almost certainly retrieval returning empty). Above 80% on the first try would be suspicious — likely the evals aren't strict enough.

The JSON report is saved to `eval-results/run-<timestamp>.json`. That's the regression baseline.

---

## Phase 8 — Final smoke test on a real phone (~5 min)

Open the Vercel URL on your phone.

- Visit `/` — landing page loads
- Visit `/rights` — see 15 scenarios listed
- Open `/rights/fir-process` — read it, verify the trigger warning banner and helpline card both appear
- Visit `/law` — see the statute index
- Visit `/chat` — ask a real legal question, verify a real response with citations streams back
- Try installing as a PWA from the browser menu — should work because the icons are now in `public/`

**At this point, the project is alive.**

---

## Manual things still pending after this runbook

| Item | When | Cost |
|---|---|---|
| Custom domain (`nyaymitra.in`?) pointed at Vercel | When you want | ~₹1000/year |
| Lawyer review of all 15 scenarios | Before public launch | ₹50k-₹2L |
| Privacy policy + Terms of Service | Before launch | DIY or template (~₹5k for review) |
| DPO designation | Before scale | You self-designate at MVP |
| Bar Council of India proactive engagement letter | Within first 3 months | Free, your time |
| Google Play Store listing (if shipping Android) | When mobile app is ready | $25 one-time + your time |

These are not in the runbook because they don't gate the technical deployment. The site can be live and useful without them. They do gate **public launch / marketing**.

---

## If something breaks

The most likely failure modes, in order of probability:

1. **Migration fails to apply** — usually because a previous one didn't run. Re-check Phase 1.3 in order.
2. **Embeddings generation fails halfway** — re-run, it's idempotent (`is null` filter skips already-embedded rows).
3. **Chat function returns empty responses** — check `query_logs`, check edge function secrets, check IVFFlat indexes exist.
4. **Vercel build fails** — usually a missing env var. Check the build log for the exact var.
5. **Tests fail in CI** — almost always a flaky test or an environment issue (Node version, locale). Fix with a small patch.

For each: read the error, search the migration/script for the function name, fix forward. Don't roll back the database — none of these are corrupting operations.

---

## What success looks like

You can paste this Vercel URL to a friend. They open it on their phone, type "What should I do if police don't register my FIR?", and they get back a coherent answer citing BNSS s.173 and s.175, with the NALSA helpline and the standard disclaimer.

That's MVP. Everything after — pro tier, mobile app, vernacular bodies, more scenarios, lawyer review, marketing — is downstream of getting to this point.
