# Ingestion pipelines

Python scripts that pull legal corpus data from public sources and write to
Supabase.

## What's here

| File | What it does | Source |
|---|---|---|
| `statutes_ingest.py` | Downloads statute sections from IndiaCode (12 statutes), parses HTML index + per-section bodies (with PDF fallback for older Acts), writes to `statutes` table. | `indiacode.nic.in` (Government of India, public-domain) |
| `sc_judgments_ingest.py` | Bulk downloads Supreme Court judgments from the public AWS S3 bucket, V2-index aware. | `s3://indian-supreme-court-judgments` (Vanga / Dattam Labs, CC-BY-4.0) |

These are **batch / offline** pipelines. They run on Hansal's i9 / M3 Max
periodically — not on every user request.

## First-time setup

```bash
cd ingestion/
python -m venv venv
source venv/bin/activate                  # macOS / Linux
# .\venv\Scripts\Activate                 # Windows
pip install -r requirements.txt
```

## Environment

Both scripts expect Supabase credentials in `.env` at the **repo root**:

```bash
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

The service-role key has full database access and **must not** be exposed to
the client. It's only used by ingestion and edge functions.

## Statute ingestion

### Quick smoke test (recommended first run)

```bash
python statutes_ingest.py --slug bns --dry-run --limit 5 --out-jsonl /tmp/bns_test.jsonl
cat /tmp/bns_test.jsonl | head -3
```

This:
- fetches the BNS act-detail page from IndiaCode;
- parses the section index (expect 358 entries);
- fetches the first 5 section bodies;
- writes them as JSONL for inspection;
- **doesn't** write to Supabase (`--dry-run`).

If the JSONL looks correct, drop `--dry-run` and `--limit` for the real run.

### Full ingest of one statute

```bash
python statutes_ingest.py --slug bns
```

Takes ~5–10 minutes for BNS (358 sections × ~1 sec polite delay). Each
section is upserted on `(statute_slug, section_number)` so re-runs are
idempotent.

### Ingest all 12 statutes

```bash
python statutes_ingest.py --all
```

~30–45 minutes total. Run from a stable connection.

### Available statutes

| Slug | Title | Approx. sections |
|---|---|---|
| `bns` | Bharatiya Nyaya Sanhita, 2023 | 358 |
| `bnss` | Bharatiya Nagarik Suraksha Sanhita, 2023 | ~531 |
| `bsa` | Bharatiya Sakshya Adhiniyam, 2023 | 170 |
| `dpdp` | Digital Personal Data Protection Act, 2023 | 44 |
| `rti` | Right to Information Act, 2005 | 31 |
| `dv` | Protection of Women from Domestic Violence Act, 2005 | 37 |
| `cpa` | Consumer Protection Act, 2019 | 107 |
| `mv` | Motor Vehicles Act, 1988 | ~217 |
| `hma` | Hindu Marriage Act, 1955 | 30 |
| `sma` | Special Marriage Act, 1954 | 51 |
| `ica` | Indian Contract Act, 1872 | 266 |
| `constitution` | Constitution of India | 395+ Articles |

The `constitution` slug uses the PDF-fallback parser; the rest use the
default HTML parser. See `docs/corrections/001-indiacode-handles.md` for
verified handles.

### Verifying a run

```sql
-- Count sections per statute
SELECT statute_slug, COUNT(*) AS n
FROM statutes
WHERE statute_slug IS NOT NULL
GROUP BY statute_slug
ORDER BY statute_slug;

-- Spot-check a section
SELECT section_number, title, length(body) AS body_len
FROM statutes
WHERE statute_slug = 'bns' AND section_number = '85'
LIMIT 1;
```

## SC judgment ingestion

### Quick smoke test

```bash
python sc_judgments_ingest.py --year 2023 --dry-run
```

Lists the parts available for 2023 (typically 1 part, ~0.4 GB) without
downloading.

### Real run for one year

```bash
python sc_judgments_ingest.py --year 2024 --out ./data/sc_judgments
```

Downloads:
- `english.tar` (and `part-*.tar` for split years)
- `metadata.parquet`

into `./data/sc_judgments/year=2024/`. Add `--extract` to also explode the
PDFs out of the tars.

### Range run

```bash
python sc_judgments_ingest.py --from 2015 --to 2025 --metadata-only
```

Pulls metadata Parquet files only (~1 MB per year, fast) without the heavy
tars. Useful for a first pass to build an index.

### Storage planning

The full corpus (1950–present) is ~52 GB across all years. Recent years are
larger (post-2010 averages ~3 GB/year). For MVP, start with the last 10
years (~30–40 GB) and expand later.

### Attribution

The dataset is CC-BY-4.0. The required attribution string is hard-coded in
`sc_judgments_ingest.py` as `ATTRIBUTION` and **must be displayed** on any
UI surface showing judgment text or close paraphrases:

> Source: Vanga (2025). Indian Supreme Court Judgments. AWS Open Data
> Registry. https://registry.opendata.aws/indian-supreme-court-judgments/
> (CC-BY-4.0)

## Common issues

### `ModuleNotFoundError: No module named 'tenacity'`
You haven't activated the venv or run `pip install -r requirements.txt`.

### `requests.exceptions.HTTPError: 403 Client Error`
IndiaCode is rate-limiting you. The script already throttles to 1 req/sec.
Tune via `INDIACODE_DELAY_SEC=2.0 python statutes_ingest.py ...` if needed.

### `pdfminer.six` warnings
Harmless. They're warnings about minor PDF parsing oddities, not errors.

### Supabase upsert failure on `(statute_slug, section_number)`
Apply migration `20260502000000_add_pgvector_fts_and_ingestion_fields.sql`
which creates the unique index and adds the `statute_slug` column.

### "no schema has been selected to create in"
Your `SUPABASE_SERVICE_ROLE_KEY` is wrong or expired.

## Roadmap

- High Court judgments (analogous bucket once Vanga publishes it).
- State Acts (per-state IndiaCode subtree).
- Embedding generation (separate script or extension to these — produces
  vectors for the `embedding` columns added in migration 20260502000000).
- IPC ↔ BNS / CrPC ↔ BNSS / Indian Evidence ↔ BSA cross-mapping table.
