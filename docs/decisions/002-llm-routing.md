# ADR-002: LLM routing — Claude Sonnet vs Gemini Flash vs local Ollama

| | |
|---|---|
| Status | Proposed |
| Date | 2026-05-02 |
| Authors | Claude (agent), Hansal Gandhi |
| Decision | Three-tier routing: local Ollama (default) → Gemini Flash (fallback) → Claude Sonnet (escalation). Claude Opus reserved for offline pipelines. |
| MVP scale assumption | 1,000 user queries/day (~30K/month), avg 2K input tokens (system prompt + retrieved context), avg 500 output tokens. |

## Context

NyayMitra has two surfaces with very different cost / quality / latency profiles:

1. **Free citizen layer** — a "know your rights" Q&A interface, scenario lookup, vernacular paraphrasing. High volume, low margin (zero margin: it's a public service). Quality bar: **no hallucinated citations, plain language, vernacular fluency**. Latency target: **<3s end-to-end**.
2. **Paid professional layer** — research, drafting, summarisation, multi-judgment synthesis. Lower volume, higher value. Quality bar: **paragraph-level citation discipline, multi-document synthesis, legal reasoning, English prose at the level of a junior associate**. Latency tolerance: **up to 30s for synthesis, instant for retrieval**.

We also have **batch / offline workloads**: corpus ingestion (judgment summarisation, headnote generation), embedding generation, scenario QA evaluation. These are not user-facing and are dominated by token volume, not latency.

Our **stack constraints**:

- 16-agent local AI infra (clawdbot/HEAD on i9 + M3 Max + Ollama, models: `qwen2.5-coder:32b`, `gemma3:12b`).
- Supabase + pgvector for retrieval.
- DPDP Act 2023 compliance: any personal data sent to a third-party model must have a lawful basis under the Act. **Sensitive case facts uploaded by paid users should never leave Indian / our infra by default.**

## The pricing landscape (verified 2 May 2026)

All figures per million tokens, USD.

| Model | Input | Output | Notes |
|---|---|---|---|
| **Claude Opus 4.7** | $5.00 | $25.00 | Flagship; 1M context. |
| **Claude Sonnet 4.6** | $3.00 | $15.00 | Best balance. |
| **Claude Haiku 4.5** | $1.00 | $5.00 | Fast, cheap. |
| **Gemini 2.5 Pro** | $1.25 | $10.00 | (≤200K context tier.) |
| **Gemini 2.5 Flash** | $0.30 | $2.50 | Workhorse. |
| **Gemini 2.5 Flash-Lite** | $0.10 | $0.40 | Cheapest commercial. |
| **Local Ollama (qwen2.5-coder:32b, gemma3:12b)** | $0 marginal | $0 marginal | Hardware amortised; ~10–30 tok/s on M3 Max. |

**Modifiers** (apply to all paid APIs):
- **Prompt caching** — up to **90% off cached input** on both Claude and Gemini. Critical for the system prompt + scenario corpus.
- **Batch API** — **50% off** on both providers for async workloads.
- **Long context (>200K tokens)** — Gemini 2.5 Pro switches to a 2× input / 1.5× output tier; Claude 4.6/4.7 keep flat 1M-context pricing.

## Cost arithmetic at MVP scale

**Assumed query shape:** 2,000 input tokens (system prompt 1,000 + retrieved 4 chunks @ 250 = 1,000), 500 output tokens. 1,000 queries/day = **30,000/month**.

**Monthly token volume per million queries-equivalent:**
- Input: 30M tokens
- Output: 15M tokens

### Cost if all 30K queries/month go to one model

| Routing | Input cost | Output cost | Monthly total | Per query |
|---|---|---|---|---|
| All Claude Opus 4.7 (no caching) | 30M × $5 = **$150** | 15M × $25 = **$375** | **$525** | $0.0175 |
| All Claude Sonnet 4.6 (no caching) | 30M × $3 = **$90** | 15M × $15 = **$225** | **$315** | $0.0105 |
| All Claude Sonnet 4.6 **with 90% cache hit on system prompt** (effective input = 1M fresh + 29M cached @ $0.30) | 1M × $3 + 29M × $0.30 = **$11.70** | 15M × $15 = **$225** | **$236.70** | $0.0079 |
| All Claude Haiku 4.5 + cache | ~$3.90 + 15M × $5 = **$78.90** | — | **$78.90** | $0.0026 |
| All Gemini 2.5 Flash + cache | ~$0.90 + 15M × $2.50 = **$38.40** | — | **$38.40** | $0.0013 |
| All Gemini 2.5 Flash-Lite + cache | ~$0.30 + 15M × $0.40 = **$6.30** | — | **$6.30** | $0.00021 |
| All local Ollama | **$0** marginal | **$0** marginal | **$0** | — |

(Cache assumption: 1,000-token system prompt + ~500-token scenario context is reused across queries, achieving ~90% cache hit on input. This is conservative — real RAG systems with stable corpus prefixes regularly hit higher.)

### Cost if we route on a tiered policy (proposed)

Working assumption based on early triage data and what's reasonable for a Q&A workload:

- **65% of queries — local Ollama** (lookup, simple definitions, vernacular paraphrasing, retrieval-only QA where the model is mainly templating retrieved content);
- **30% of queries — Gemini 2.5 Flash** (most actual reasoning, multi-paragraph answers, scenario synthesis);
- **5% of queries — Claude Sonnet 4.6** (escalation: complex queries, ambiguous facts, anything where we want the highest-quality citation discipline).

| Tier | Queries/mo | Input ($) | Output ($) | Subtotal |
|---|---|---|---|---|
| Local (Ollama) — 65% | 19,500 | $0 | $0 | **$0** |
| Gemini 2.5 Flash + 90% cache — 30% | 9,000 (= 18M in / 4.5M out) | 1.8M × $0.30 + 16.2M × $0.03 = **$1.03** | 4.5M × $2.50 = **$11.25** | **$12.28** |
| Claude Sonnet 4.6 + 90% cache — 5% | 1,500 (= 3M in / 0.75M out) | 0.3M × $3 + 2.7M × $0.30 = **$1.71** | 0.75M × $15 = **$11.25** | **$12.96** |
| **Total** | 30,000 | | | **~$25/month** |

**Rounded estimate at MVP scale: ~$25/month for the citizen layer.** Headroom of ~5× before crossing $150/month even with conservative caching.

### Pro-tier estimate (per paying customer)

Assume a paying advocate runs **50 research queries/day** with avg 8K input (loaded judgments) + 1.5K output, 5% needing Opus-class synthesis:

- Sonnet 4.6 (95%): 47.5 queries × 22 days × (8K × $3 + 1.5K × $15) = ~**$25/customer/month**
- Opus 4.7 (5%): 2.5 queries × 22 days × (8K × $5 + 1.5K × $25) = ~**$5/customer/month**
- **Total: ~$30/customer/month** in API costs.

A pricing target of **₹2,500–3,500/month** ($30–42) per professional user would barely cover costs. **Pricing must be ₹6,000+/month** to give margin for compute, support, and the free-tier subsidy. This puts us **70–85% below Manupatra's enterprise tiers**, consistent with the wedge strategy in the foundational blueprint.

## Decision: tiered routing

### Tier 0 — Local Ollama (default)

Use for: definitions, fact retrieval where the model templates retrieved text, vernacular paraphrasing of canned content, intent classification, query rewriting, embedding generation.

- Model: `gemma3:12b` for general Q&A; `qwen2.5-coder:32b` for any code/structure-output tasks (citation parsing, JSON extraction).
- **Routing condition:** confidence threshold from a lightweight classifier (heuristic-based at first, learned later).
- **Privacy benefit:** all citizen-tier queries with personally identifiable content stay on our infra. **DPDP-aligned by default.**

### Tier 1 — Gemini 2.5 Flash (fallback)

Use for: most user-facing reasoning queries, multi-step explanations, scenario synthesis, vernacular generation requiring fluency beyond Ollama's 12B class.

- Why Flash over Sonnet here: **10× cheaper input, 6× cheaper output**, with quality that benchmarks suggest is sufficient for non-citation-critical generation. We can route 30% of traffic to Flash and stay under $15/month.
- **Caching is mandatory.** System prompt + the scenario being referenced should be cached.
- **Data egress:** Gemini API. We accept this for non-sensitive citizen queries.

### Tier 2 — Claude Sonnet 4.6 (escalation)

Use for: queries flagged by the classifier as **citation-critical**, **ambiguous facts**, or **multi-statute synthesis**. Pro-tier research queries default here.

- Sonnet over Opus: **40% cheaper**. Sonnet 4.6 has 1M context at flat pricing — fits any single statute or judgment.
- **Caching mandatory.** The system prompt for the pro-tier (which is large — citation rules, BNS/BNSS/BSA mapping, disclaimer scaffolding) is the highest-value cache target.

### Tier 3 — Claude Opus 4.7 (offline / batch only)

Use for: corpus-quality work — judgment headnote generation, scenario QA evaluation against a gold set, cross-document synthesis where we want maximum quality. **Always batch.** 50% discount halves the bill.

**Not used in the live request path** at MVP. Cost-per-query is too high to justify on a free-tier query, and Sonnet's quality is sufficient for pro-tier live use.

## What we're NOT doing, and why

- **Not running everything on Opus 4.6/4.7.** A single Opus-routed citizen query at 2K in / 500 out costs ~$0.0225 vs $0.0014 on Flash. 16× cost differential is not justified by quality differences on retrieval-grounded Q&A.
- **Not using Gemini 2.5 Pro live.** Sonnet 4.6 is cheaper on output ($15 vs… well, $10 on Pro under 200K, but Pro switches to $15/$15 over 200K). Sonnet is more predictable.
- **Not using Flash-Lite live.** Quality drop is real on the multi-step reasoning that scenario answers require. We will use Flash-Lite for **classification** and **embedding-style** tasks if we need to.
- **Not building an LLM-as-a-judge meta-router yet.** Ship a heuristic classifier first (intent + estimated complexity); learn the routing thresholds from production. Classifier-as-a-router adds latency and cost.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Local Ollama hallucinates a section number | Forced retrieval-only mode for legal claims; Tier-1+2 verification on any citation. |
| Gemini API outage | Failover to Sonnet at Tier 1 (cost spike but not unavailability). |
| Cache invalidation explodes input cost | Pin scenario + system prompt as cache anchors; rotate corpus only on weekly cadence. |
| DPDP non-compliance through API egress | Tier-0-only pipeline for any query containing PII; egress allowed only after PII redaction at the edge. |
| 1M-context "fill the whole judgment" pattern | Hard limit RAG context to top-k=8 chunks @ ~500 tokens each; fall back to summarised judgments rather than full text. |

## Implementation checklist

- [ ] Implement intent classifier (heuristic, then learned). Owner: Antigravity.
- [ ] Implement prompt caching for system prompt + scenario context on both Claude and Gemini paths. Owner: Antigravity.
- [ ] Write a citation-discipline test suite (gold-set scenario answers, evaluate via batch Opus). Owner: Claude (this agent), in `content/eval/`.
- [ ] PII-redaction step before Tier-1/Tier-2 egress. Owner: Antigravity.
- [ ] Cost dashboard surfacing per-tier, per-day spend. Owner: Antigravity.
- [ ] Re-evaluate routing thresholds at 5,000 daily queries. Owner: both.

## Sources

Pricing verified 2 May 2026 against:
- `https://platform.claude.com/docs/en/about-claude/pricing` (Claude API)
- `https://ai.google.dev/gemini-api/docs/pricing` (Gemini)
- Independent confirmation via `benchlm.ai`, `finout.io`, and `metacto.com` Anthropic pricing breakdowns.

## Revision triggers

This ADR should be revisited if:
- API list prices change by more than 20%.
- Daily query volume exceeds 5,000.
- DPDP rule notification places further restrictions on cross-border data transfer.
- A meaningfully better local model (e.g. an Indic-tuned 70B+) becomes runnable on our stack.
