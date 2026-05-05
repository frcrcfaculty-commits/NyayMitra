# Eval suite

Citation-discipline evaluation for the NyayMitra chat function.

## Files

- `citizen.jsonl` — 50 citizen-tier queries spanning all 10 scenario categories plus 2 out-of-scope fallback cases.

## Run

```
node scripts/run-eval.mjs --file content/eval/citizen.jsonl --url <chat endpoint URL>
```

The runner reads from `SUPABASE_ANON_KEY` (or pass `--key`).

Default URL is `http://127.0.0.1:54321/functions/v1/chat` (local dev). For production, pass:
```
--url https://<your-project>.supabase.co/functions/v1/chat
```

Reports are written to `eval-results/run-<timestamp>.json` and the runner exits non-zero if pass-rate falls below `--threshold` (default 0.8).

## What the runner checks per case

| Field | Meaning |
|---|---|
| `must_cite` | citations that MUST appear in the response (e.g. `BNSS s.173`) |
| `must_not_cite` | citations that MUST NOT appear — typically old codes (`CrPC s.154`, `IPC s.498A`) |
| `must_contain` | substrings that must be present (e.g. `30 days`, `NALSA`) |
| `must_not_contain` | substrings forbidden (e.g. `AI lawyer`, `your case is strong`) |
| `must_have_disclaimer` | whether the standard disclaimer must be present (default true) |
| `id`, `category`, `scenario_slug`, `query` | metadata for grouping and reporting |

The runner additionally enforces a global rule: any response containing "AI lawyer", "replace your lawyer", "I am a lawyer", or "I'm a lawyer" fails automatically — these are absolute prohibitions for citizen-tier output regardless of what the test case says.

Citations are extracted from the response in two ways:
1. Markdown links from the citation linkifier: `[BNSS s.173](/law/bnss/173)`
2. Bare references: `BNSS s.173`, `BNSS Section 173`, `BNS Article 21`

Both forms are normalised to `BNSS s.173` for comparison.

## Distribution (for fairness across the corpus)

| Category | Cases |
|---|---|
| criminal (FIR, arrest, bail) | 13 |
| financial (cheque, motor accident) | 6 |
| family (marriage, maintenance) | 5 |
| family-criminal (DV, dowry) | 5 |
| consumer | 4 |
| cyber | 4 |
| workplace (POSH) | 4 |
| civic (RTI) | 3 |
| succession | 3 |
| tenant | 3 |
| out-of-scope (fallback behavior) | 2 |
| **Total** | **52** |

## Designing new cases

1. Each case should test ONE specific thing — a section number, a time limit, a disclaimer, a fallback behavior.
2. **Always include `must_not_cite` for the corresponding old code** if testing a new BNS/BNSS/BSA section. The single most common failure mode for the model is citing IPC alongside BNS as if they're parallel.
3. Use `must_contain` for procedural facts ("30 days", "Magistrate", "Internal Committee") that aren't section numbers but are still verifiable.
4. Use `must_not_contain` to catch bad framing — `AI lawyer`, `you should sue`, `your case is strong` — that crosses the legal-information / legal-advice line.
5. Out-of-scope cases (weather, sports) should still verify the disclaimer is present and the model doesn't pretend to be a lawyer.

## Future expansions

- `pro.jsonl` — pro-tier eval suite with judgment-citation precision (paragraph numbers).
- `vernacular.jsonl` — same queries in Hindi and Marathi to verify translation pipeline.
- `regression.jsonl` — known-bad responses caught in production, frozen as test cases.
