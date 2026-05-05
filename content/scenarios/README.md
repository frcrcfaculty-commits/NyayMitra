# Citizen-Facing Scenarios — Master List

This directory contains the 15 citizen-facing "know your rights" scenarios that ship with the NyayMitra MVP. Each is a markdown file with locked frontmatter (see `_template.md`).

## How to add a new scenario

1. Copy `_template.md` to `NNN-your-scenario-slug.md` (next available number).
2. Fill in frontmatter — every field is required except `trigger_warning`.
3. Write content following the patterns in 001–015.
4. Run `node scripts/seed-scenarios.mjs` to push into Supabase.

## Scenario index

| # | Slug | Title | Primary Statute | Category |
|---|---|---|---|---|
| 001 | `tenant-rights` | Tenant Rights in India | TPA, ICA, state laws | tenant |
| 002 | `fir-process` | How to File an FIR | BNSS | criminal |
| 003 | `consumer-complaint` | Filing a Consumer Complaint | CPA 2019 | consumer |
| 004 | `rights-during-arrest` | Your Rights If You Are Arrested | BNSS, Constitution | criminal |
| 005 | `how-to-apply-for-bail` | How to Apply for Bail in India | BNSS | criminal |
| 006 | `how-to-file-rti` | How to File an RTI Application | RTI Act | civic |
| 007 | `domestic-violence-emergency` | Domestic Violence: Emergency Steps | DV Act, BNS | family-criminal |
| 008 | `marriage-registration` | Marriage Registration in India | HMA, SMA | family |
| 009 | `workplace-sexual-harassment` | Workplace Sexual Harassment | POSH Act | workplace |
| 010 | `cheque-bounce` | Cheque Bounce: Rights and Remedies | NI Act | financial |
| 011 | `cybercrime-online-fraud` | Cybercrime and Online Fraud | IT Act, BNS | cyber |
| 012 | `wills-and-succession` | Wills, Inheritance, and Succession | HSA, ISA | succession |
| 013 | `motor-accident-claims` | Motor Accident Claims | MV Act | financial |
| 014 | `maintenance-under-law` | Maintenance Rights | BNSS, HMA, DV | family |
| 015 | `dowry-prohibition` | Dowry Prohibition | DPA, BNS | family-criminal |

## Citation discipline

Every scenario must:

1. **Cite BNS / BNSS / BSA as primary** for criminal / procedural / evidence law. Old codes (IPC, CrPC, Indian Evidence Act) only as cross-mapping context with explicit "(formerly IPC s.X)" framing.
2. **Cite section numbers only when verified.** If unsure, describe the concept without numbers. There are no `[VERIFY: …]` markers in the current set; use the marker if you find yourself uncertain in future contributions.
3. **Acknowledge state variation** where state laws govern (rent control, marriage rules, registration, etc.).
4. **End with the standard disclaimer** (see `_template.md`).
5. **List relevant helpline numbers** at the end. The standard set:
   - **15100** NALSA legal aid
   - **181** Women's helpline (24×7)
   - **112** Police emergency
   - **1930** National cyber-fraud helpline
   - **1915** Consumer helpline
   - **7827170170** National Commission for Women
   - **14567** Senior Citizens helpline (Elder Helpline)

## Categories used

The 10-category taxonomy is locked in `src/i18n/locales/{en,hi,mr}.json` under `rights.categories`:

- **tenant** — landlord–tenant, deposits, eviction, rent control
- **criminal** — FIR, arrest, bail, criminal procedure
- **family** — marriage, divorce, maintenance, custody
- **family-criminal** — dowry, domestic violence (overlap)
- **consumer** — defective goods, services, refunds
- **workplace** — POSH, labour, employment
- **financial** — cheque bounce, motor accidents, banking
- **cyber** — cybercrime, online fraud, data protection
- **succession** — wills, inheritance, intestate
- **civic** — RTI, transparency, citizen-state interactions

To add a new category, update both this list and the `rights.categories` block in the i18n locales.

## Pending vernacular content

Frontmatter `title_hi` and `title_mr` are populated for all 15 scenarios. **Bodies are English-only** — vernacular versions are deferred to the Tier 1 Gemini Flash translation edge function at request time. See `docs/decisions/002-llm-routing.md` and `docs/ROADMAP.md` Phase 3.

## Last full review

**2 May 2026** — all 15 scenarios reviewed and live in this state. Each scenario carries its own `last_reviewed` frontmatter date for granular tracking.
