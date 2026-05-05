"""
ingestion/sc_judgments_ingest.py
=================================

Bulk downloader for Indian Supreme Court judgments from the public AWS S3
dataset maintained by Vanga / Dattam Labs.

Verified 2 May 2026 against:
    - https://github.com/vanga/indian-supreme-court-judgments/blob/main/README.md
    - https://registry.opendata.aws/indian-supreme-court-judgments/

KEY FACTS (do not regress)
--------------------------
- Bucket: s3://indian-supreme-court-judgments
- Region: ap-south-1
- Public, no AWS credentials needed (--no-sign-request)
- License: CC-BY-4.0 (REQUIRES attribution: "Vanga (2025). Indian Supreme Court
  Judgments. AWS Open Data Registry.")
- Coverage: 1950 - present (~35K English judgments, ~52 GB total)

LAYOUT
------
    s3://indian-supreme-court-judgments/
      data/
        tar/
          year=YYYY/
            english/
              english.tar              # primary archive
              english.index.json       # V2 index (lists parts)
              part-YYYYMMDDTHHMMSS.tar  # additional parts when archive > 1 GB
            regional/
              regional.tar
              regional.index.json
      metadata/
        tar/
          year=YYYY/
            metadata.tar
            metadata.index.json
        parquet/
          year=YYYY/
            metadata.parquet           # structured: case_id, citation, judges, etc.

V2 INDEX FORMAT
---------------
{
  "year": 2025,
  "archive_type": "english",
  "file_count": 8131,
  "total_size": 5740309504,
  "parts": [
    {"name": "english.tar", "files": [...], "file_count": 5000, ...},
    {"name": "part-20251227T103000.tar", ...}
  ]
}

When ingesting a year, fetch index.json first, then iterate `parts[]` so we
catch the additional archives created when the year's data exceeded 1 GB.

USAGE
-----
    # Download English judgments for 2024 (all parts)
    python ingestion/sc_judgments_ingest.py --year 2024

    # Just metadata (parquet) for the whole range
    python ingestion/sc_judgments_ingest.py --metadata-only --from 1950 --to 2025

    # Dry run: list what would be downloaded
    python ingestion/sc_judgments_ingest.py --year 2024 --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import tarfile
from pathlib import Path
from typing import Optional

import requests

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("sc_judgments")

# ---------------------------------------------------------------------------
# Verified S3 constants (DO NOT change without re-verifying README)
# ---------------------------------------------------------------------------

SC_S3_BUCKET = "indian-supreme-court-judgments"
SC_S3_REGION = "ap-south-1"

# HTTPS base for unauthenticated public-bucket access. Two equivalent forms exist
# (with/without region in hostname); README documents both. We use the
# region-less form, which is the one the README's example link uses.
SC_S3_BASE = f"https://{SC_S3_BUCKET}.s3.amazonaws.com"

# Layout prefixes
DATA_TAR_PREFIX = "data/tar"
METADATA_TAR_PREFIX = "metadata/tar"
METADATA_PARQUET_PREFIX = "metadata/parquet"

# Earliest available year. The dataset starts at 1950 (Independence-era SC
# inception); some older years have very few or zero judgments.
YEAR_MIN = 1950
# YEAR_MAX is open-ended; check the index.json existence per year.

# Required attribution string for CC-BY-4.0 compliance. Embed this in any
# user-facing surface where SC judgment text or derivatives are shown.
ATTRIBUTION = (
    "Source: Vanga (2025). Indian Supreme Court Judgments. AWS Open Data Registry. "
    "https://registry.opendata.aws/indian-supreme-court-judgments/ (CC-BY-4.0)"
)


# ---------------------------------------------------------------------------
# URL builders
# ---------------------------------------------------------------------------

def english_index_url(year: int) -> str:
    return f"{SC_S3_BASE}/{DATA_TAR_PREFIX}/year={year}/english/english.index.json"


def english_part_url(year: int, part_name: str) -> str:
    return f"{SC_S3_BASE}/{DATA_TAR_PREFIX}/year={year}/english/{part_name}"


def metadata_parquet_url(year: int) -> str:
    return f"{SC_S3_BASE}/{METADATA_PARQUET_PREFIX}/year={year}/metadata.parquet"


def metadata_index_url(year: int) -> str:
    return f"{SC_S3_BASE}/{METADATA_TAR_PREFIX}/year={year}/metadata.index.json"


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def http_get(url: str, *, stream: bool = False, timeout: int = 60) -> requests.Response:
    log.debug("GET %s", url)
    r = requests.get(url, stream=stream, timeout=timeout)
    r.raise_for_status()
    return r


def fetch_index(year: int) -> Optional[dict]:
    """Fetch and parse english.index.json for a given year. Returns None if missing."""
    try:
        r = http_get(english_index_url(year))
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            log.warning("No data for year %d (404)", year)
            return None
        raise
    return r.json()


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------

def download_to(url: str, dest: Path, *, chunk_size: int = 1 << 20) -> int:
    """Stream a URL to disk. Returns bytes written. Skips if dest already exists with same size."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        # Crude resumability: if size matches Content-Length, treat as done.
        head = requests.head(url, timeout=30)
        head.raise_for_status()
        remote_size = int(head.headers.get("Content-Length", "0"))
        if remote_size and dest.stat().st_size == remote_size:
            log.info("[skip] %s already complete (%d bytes)", dest, remote_size)
            return 0

    written = 0
    with http_get(url, stream=True) as r, open(dest, "wb") as f:
        for chunk in r.iter_content(chunk_size=chunk_size):
            if chunk:
                f.write(chunk)
                written += len(chunk)
    log.info("[ok] %s (%d bytes)", dest, written)
    return written


def ingest_year(year: int, out_dir: Path, *, metadata_only: bool = False, dry_run: bool = False) -> int:
    """Download all parts (and metadata) for a given year. Returns bytes written."""
    log.info("=== Year %d ===", year)
    bytes_written = 0

    if not metadata_only:
        index = fetch_index(year)
        if index is None:
            return 0

        parts = index.get("parts", [])
        log.info("Year %d: %d parts, total %.2f GB",
                 year, len(parts), index.get("total_size", 0) / 1e9)

        for part in parts:
            url = english_part_url(year, part["name"])
            dest = out_dir / f"year={year}" / "english" / part["name"]
            log.info("Part %s (%.2f GB)", part["name"], part.get("size", 0) / 1e9)
            if dry_run:
                continue
            bytes_written += download_to(url, dest)

    # Metadata is small; always grab the parquet
    parquet_dest = out_dir / f"year={year}" / "metadata.parquet"
    parquet_url = metadata_parquet_url(year)
    if dry_run:
        log.info("[dry-run] would fetch %s -> %s", parquet_url, parquet_dest)
    else:
        try:
            bytes_written += download_to(parquet_url, parquet_dest)
        except requests.HTTPError as e:
            log.warning("metadata.parquet missing for year %d: %s", year, e)

    return bytes_written


# ---------------------------------------------------------------------------
# Optional: extract PDFs from the downloaded tar files
# ---------------------------------------------------------------------------

def extract_year_tars(year: int, out_dir: Path) -> int:
    """Extract all PDFs from year's tars into out_dir/year=YYYY/pdfs/."""
    src = out_dir / f"year={year}" / "english"
    pdf_dir = out_dir / f"year={year}" / "pdfs"
    pdf_dir.mkdir(parents=True, exist_ok=True)
    n = 0
    for tar_path in src.glob("*.tar"):
        log.info("Extracting %s", tar_path)
        with tarfile.open(tar_path) as tf:
            for member in tf.getmembers():
                if not member.isfile() or not member.name.lower().endswith(".pdf"):
                    continue
                # Flatten path: just use basename
                name = Path(member.name).name
                target = pdf_dir / name
                if target.exists():
                    continue
                with tf.extractfile(member) as src_f, open(target, "wb") as dst_f:
                    dst_f.write(src_f.read())
                n += 1
    log.info("Year %d: extracted %d PDFs into %s", year, n, pdf_dir)
    return n


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: Optional[list[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Ingest SC judgments from public S3.")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--year", type=int, help="Single year to ingest")
    g.add_argument("--from", dest="year_from", type=int, help="Start of year range")
    p.add_argument("--to", dest="year_to", type=int, help="End of year range (inclusive)")
    p.add_argument("--out", default="./data/sc_judgments", help="Output directory")
    p.add_argument("--metadata-only", action="store_true",
                   help="Skip the heavy tar archives; pull only metadata.parquet")
    p.add_argument("--extract", action="store_true",
                   help="After download, extract PDFs from tar files")
    p.add_argument("--dry-run", action="store_true",
                   help="List what would be downloaded; no fetches")
    args = p.parse_args(argv)

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.year is not None:
        years = [args.year]
    else:
        if args.year_to is None:
            log.error("--from requires --to")
            return 2
        years = list(range(args.year_from, args.year_to + 1))

    total = 0
    for y in years:
        if y < YEAR_MIN:
            log.warning("Year %d < %d; skipping.", y, YEAR_MIN)
            continue
        try:
            total += ingest_year(y, out_dir,
                                 metadata_only=args.metadata_only,
                                 dry_run=args.dry_run)
            if args.extract and not args.dry_run and not args.metadata_only:
                extract_year_tars(y, out_dir)
        except Exception:
            log.exception("Year %d failed", y)

    log.info("Done. Total bytes written: %d (%.2f GB)", total, total / 1e9)
    log.info("ATTRIBUTION (embed in user-facing UI): %s", ATTRIBUTION)
    return 0


if __name__ == "__main__":
    sys.exit(main())
