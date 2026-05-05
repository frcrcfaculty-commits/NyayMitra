# Data Sources

Catalog of every external data source used by NyayMitra, with licensing and
practical notes.

## Statutes — IndiaCode

- **URL:** `https://www.indiacode.nic.in`
- **Provider:** Government of India, Ministry of Law and Justice
- **Licensing:** Government work, public-domain reproduction permitted
  under Copyright Act s.52(1)(q)(ii) (matter published in official Gazette)
- **Coverage:** all Central Acts of Parliament; some State Acts; several
  thousand Acts in total
- **Format:** HTML for most current statutes; PDF fallback for older Acts
- **Stability:** stable URL structure; occasional layout tweaks
- **Rate limits:** none stated, but our ingestion throttles to 1 req/sec
- **User-Agent:** the site 403s identifying UAs (e.g. "python-requests"),
  so the script uses a browser User-Agent string by default
- **Verified handles:** see `docs/corrections/001-indiacode-handles.md`

We pull 12 core statutes for the MVP; see `ingestion/statutes_ingest.py`.

## Supreme Court judgments — AWS S3

- **Bucket:** `s3://indian-supreme-court-judgments` (public, region
  ap-south-1)
- **Provider:** Vanga / Dattam Labs
- **Licensing:** **CC-BY-4.0** — attribution required
- **Registry:** `https://registry.opendata.aws/indian-supreme-court-judgments/`
- **Coverage:** Supreme Court judgments from 1950 to present
- **Total size:** ~52 GB across all years
- **Format:**
  - `data/tar/year=YYYY/english/english.tar` — single-part archives for
    smaller years
  - `data/tar/year=YYYY/english/part-N.tar` plus
    `data/tar/year=YYYY/english/english.index.json` — multi-part archives
    for large years (V2 index format)
  - `data/parquet/year=YYYY/metadata.parquet` — per-year metadata
- **Access:** anonymous (no AWS credentials required)
- **Approximate counts:** ~35,000 judgments across the full corpus

**Required attribution string** (must appear on any UI surface showing
judgment text):

> Source: Vanga (2025). Indian Supreme Court Judgments. AWS Open Data
> Registry. https://registry.opendata.aws/indian-supreme-court-judgments/
> (CC-BY-4.0)

The string is hard-coded as `ATTRIBUTION` in
`ingestion/sc_judgments_ingest.py`.

## High Court judgments — AWS S3 (planned)

- **Bucket:** `s3://indian-high-court-judgments` (planned by the same
  provider; not yet exhaustive)
- **Coverage planned:** all 25 High Courts
- **Status:** check the AWS Open Data Registry periodically; provider
  publishes updates as the dataset grows

## Indian Kanoon API (planned, secondary)

- **URL:** `https://api.indiankanoon.org`
- **Provider:** Indian Kanoon (CodeAndo)
- **Licensing:** non-commercial use credit available; commercial use
  requires API access purchase
- **Coverage:** judgments from SC, all HCs, several tribunals — broader
  than S3 dataset but with rate limits
- **Use case:** filling gaps where S3 dataset is incomplete (older
  judgments, tribunal orders); resolving citations the user types in plain
  text
- **Status:** not yet integrated; likely Phase 4 / 5

## Government portals (operational, not ingested)

These are sources we **link out to**, not data we ingest:

| Portal | Purpose | Used in scenario |
|---|---|---|
| `cybercrime.gov.in` | Cybercrime reporting | 011-cybercrime-online-fraud |
| `consumerhelpline.gov.in` / `edaakhil.nic.in` | Consumer complaints | 003-consumer-complaint |
| `rti.gov.in` | RTI online filing (Central Govt only) | 006-how-to-file-rti |
| `parivahan.gov.in` | Vehicle records, motor accident matters | 013-motor-accident-claims |

## License summary for derivatives

- **Code we write:** Apache 2.0
- **Scenario content (`content/scenarios/`):** CC-BY-SA 4.0
- **Reproduced statute text:** government public-domain
- **Reproduced SC judgments:** CC-BY-4.0 (with required attribution)

## What we will NOT scrape

We deliberately do not scrape:

- **Manupatra** — paywalled, ToS forbids it.
- **SCC Online** — paywalled, ToS forbids it.
- **LexisNexis India** — paywalled, ToS forbids it.
- **Law-firm websites** — copyright on commentary belongs to the firm.
- **Bar Council of India website** — sensitive; engage proactively
  instead.

Our entire corpus is from open-data government primary sources or licensed
open datasets. This protects the project legally and matches the civic
mission.
