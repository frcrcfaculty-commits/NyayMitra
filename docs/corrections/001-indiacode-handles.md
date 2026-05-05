# IndiaCode Handle Verification — 12 Core Statutes

**Date:** 2 May 2026
**Source of truth:** `https://www.indiacode.nic.in/handle/123456789/<HANDLE>`
**Verified by:** direct fetch on each act-detail page; PDF cross-check on the `bitstream/` URLs.

> **Note on duplicates.** IndiaCode often hosts the same Act under two handles — one historical, one re-uploaded. The **canonical** handle is the one returned when browsing by Act Number under Central Acts (parent handle `123456789/1362`). Where I found duplicates I list both and mark the canonical one. The `actid` field is what the parser actually needs to fetch sections via `show-data?actid=...&sectionno=N`.

| # | Slug | Short Title | Handle (canonical) | actid | Notes |
|---|------|-------------|--------------------|-------|-------|
| 1 | `bns`        | The Bharatiya Nyaya Sanhita, 2023            | `123456789/20062` | `AC_CEN_5_23_00048_2023-45_1719292564123` | In force 1-Jul-2024. Replaces IPC 1860. |
| 2 | `bnss`       | The Bharatiya Nagarik Suraksha Sanhita, 2023 | `123456789/20340` | _fetch from act-detail page on first run_ | In force 1-Jul-2024. Replaces CrPC 1973. |
| 3 | `bsa`        | The Bharatiya Sakshya Adhiniyam, 2023        | `123456789/20063` | `AC_CEN_5_23_00049_2023-47_1719292804654` | In force 1-Jul-2024. Replaces Indian Evidence Act 1872. |
| 4 | `dpdp`       | The Digital Personal Data Protection Act, 2023 | `123456789/22037` | `AC_CEN_45_0_00003_2023-22_1763464807080` | Phased commencement: DPB provisions w.e.f. 13-Nov-2025; bulk operative provisions ~mid-2027. See COMPLIANCE.md. |
| 5 | `rti`        | The Right to Information Act, 2005           | `123456789/2065`  | `AC_CEN_26_36_00004_200522_1517807322955` | Note s.8(1)(j) was substituted by DPDP Act 2023, s.44(3). Stale duplicate at handle `19608`; do **not** use. |
| 6 | `dv`         | The Protection of Women from Domestic Violence Act, 2005 | `123456789/2021` | _fetch on first run_ | |
| 7 | `cpa`        | The Consumer Protection Act, 2019            | `123456789/15256` | `AC_CEN_21_44_00007_201935_1596441164903` | Repealed CPA 1986. Stale empty placeholder at handle `16103`; do **not** use. |
| 8 | `mv`         | The Motor Vehicles Act, 1988                 | `123456789/1798`  | _fetch on first run_ | Heavily amended by MV (Amendment) Act 2019. |
| 9 | `hma`        | The Hindu Marriage Act, 1955                 | `123456789/1560`  | _fetch on first run_ | |
| 10 | `sma`       | The Special Marriage Act, 1954               | `123456789/1387`  | _fetch on first run_ | |
| 11 | `ica`       | The Indian Contract Act, 1872                | `123456789/2187`  | `AC_CEN_3_20_00035_187209_1523268996428` | Sections 76–123 (Sale of Goods) and 239–266 (Partnership) repealed; in separate Acts. |
| 12 | `constitution` | The Constitution of India                 | `123456789/19632` | _fetch on first run_ | Articles, not sections — parser must branch on the `is_constitution` flag. |

## What likely needed correcting in the existing file
Without the current `ingestion/statutes_ingest.py` to diff against, I'm flagging the most common drift sources Antigravity should expect:

1. **CPA pointing to `16103`** — that handle is an empty placeholder ("Act is under updation"). Use `15256`.
2. **RTI pointing to `19608`** — that's a re-upload duplicate. The canonical handle browsable by Act No. 22 of 2005 is `2065`.
3. **DPDP pointing to a draft-bill PDF** — must be `22037` (Act No. 22 of 2023, assented 11-Aug-2023).
4. **BNSS pointing to handle `21544`** — that's the `bitstream` PDF path, not the act-detail handle. Correct handle is `20340`.
5. **Any IPC / CrPC / Indian Evidence Act handles** — these MUST be removed for citizen-facing content. Old codes are referenced for *cross-mapping context only* (e.g. "BNS s.103 ≈ IPC s.302") and should live in a separate `legacy_mapping/` table, not in the active corpus.

## How to derive `actid` programmatically
On the act-detail page (e.g. `/handle/123456789/20062`), the section links have query string:

```
show-data?abv=CEN&statehandle=123456789/1362&actid=AC_CEN_5_23_00048_2023-45_1719292564123
        &sectionId=90366&sectionno=1&orderno=1&orgactid=AC_CEN_5_23_00048_2023-45_1719292564123
```

The parser extracts `actid` from any one of these links and caches it for the run. No need to hard-code.
