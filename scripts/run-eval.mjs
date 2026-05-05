#!/usr/bin/env node
/**
 * scripts/run-eval.mjs
 *
 * Citation-discipline eval runner. Sends queries from a JSONL file to the
 * deployed (or local) chat edge function and grades the responses against
 * per-case expectations.
 *
 * USAGE
 *   node scripts/run-eval.mjs --file content/eval/citizen.jsonl
 *   node scripts/run-eval.mjs --file content/eval/citizen.jsonl --url https://<project>.supabase.co/functions/v1/chat
 *
 * INPUT JSONL — one test case per line. The runner accepts BOTH the
 * "expected_*" schema (Antigravity-B's original) and the "must_cite /
 * must_not_cite" schema (the standard one); they can be mixed in the same
 * file.
 *
 * Recommended schema:
 *   {
 *     "id": "fir-001",                    // free-form id for tracking
 *     "query": "How do I file an FIR?",   // the user message
 *     "category": "criminal",             // optional, for grouping reports
 *     "scenario_slug": "fir-process",     // optional, expected scenario hit
 *     "must_cite": ["BNSS s.173"],        // citations required in response
 *     "must_not_cite": ["CrPC s.154"],    // outdated citations forbidden
 *     "must_contain": ["NALSA"],          // optional substring checks
 *     "must_not_contain": ["AI lawyer"],  // optional substring exclusions
 *     "must_have_disclaimer": true        // optional, default true
 *   }
 *
 * Legacy schema (still supported):
 *   { "query": "...", "expected_intent": "...", "expected_statutes": ["BNSS s.173"] }
 *
 * OUTPUT
 *   - Per-case pass/fail with reasons printed live
 *   - Summary statistics at the end
 *   - JSON report written to eval-results/run-<ISO>.json
 *   - Exit 0 if pass-rate >= --threshold (default 0.8), else exit 1
 *
 * RUNTIME REQUIREMENTS
 *   - Node 20+
 *   - The chat edge function must be deployed and reachable (or run locally)
 *   - SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY) must be set, OR passed
 *     via --key
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseArgs } from 'util'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const options = {
  file: { type: 'string', short: 'f' },
  url: {
    type: 'string',
    short: 'u',
    default: 'http://127.0.0.1:54321/functions/v1/chat',
  },
  key: { type: 'string', short: 'k' },
  threshold: { type: 'string', default: '0.8' },
  verbose: { type: 'boolean', short: 'v', default: false },
  out: { type: 'string', short: 'o' },
}

const { values } = parseArgs({ args: process.argv.slice(2), options })

if (!values.file) {
  console.error(
    'Usage: node scripts/run-eval.mjs --file <path-to-jsonl> [--url <endpoint>] [--key <anon-key>] [--threshold 0.8] [-v]'
  )
  process.exit(1)
}

const API_KEY =
  values.key ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY

if (!API_KEY) {
  console.error(
    'Error: provide an anon key via --key, SUPABASE_ANON_KEY, or VITE_SUPABASE_ANON_KEY'
  )
  process.exit(1)
}

const PASS_THRESHOLD = parseFloat(values.threshold)
const VERBOSE = values.verbose

// ---------------------------------------------------------------------------
// Citation extraction. The chat function returns markdown text; the
// citationLinkifier converts statute references into [BNSS s.173](/law/bnss/173)
// markdown links. We extract both linked and bare references so eval works
// regardless of whether the linkifier ran.
// ---------------------------------------------------------------------------

const STATUTE_SLUGS = [
  'bns', 'bnss', 'bsa', 'rti', 'cpa', 'mv', 'hma', 'sma',
  'ica', 'dv', 'dpa', 'posh', 'ni', 'hsa', 'isa', 'dpdp',
  'tpa', 'it', 'constitution',
]

function extractCitations(text) {
  const found = new Set()
  if (!text) return found

  // Pattern 1: markdown-linkified citations [BNSS s.173](/law/bnss/173)
  const linkRe = /\[([^\]]+)\]\(\/law\/([a-z]+)\/(\d+[A-Za-z]?)\)/g
  let m
  while ((m = linkRe.exec(text)) !== null) {
    const slug = m[2].toLowerCase()
    const sec = m[3]
    found.add(`${slug.toUpperCase()} s.${sec}`)
  }

  // Pattern 2: bare references like "BNSS s.173", "BNS Section 85",
  // "Constitution Article 21". Lowercased canonicalisation.
  const slugAlt = STATUTE_SLUGS.join('|')
  const bareRe = new RegExp(
    `\\b(${slugAlt})\\s+(?:s\\.?|section|sec\\.?|article)\\s*(\\d+[A-Za-z]?)\\b`,
    'gi'
  )
  while ((m = bareRe.exec(text)) !== null) {
    const slug = m[1].toLowerCase()
    const sec = m[2]
    found.add(`${slug.toUpperCase()} s.${sec}`)
  }

  return found
}

function normaliseCitation(c) {
  // "bnss s.173" / "BNSS Section 173" / "BNSS s.173" → "BNSS s.173"
  const m = c.match(/^([a-z]+)\s+(?:s\.?|section|sec\.?|article)\s*(\d+[a-z]?)$/i)
  if (m) return `${m[1].toUpperCase()} s.${m[2]}`
  return c.toUpperCase().trim()
}

// ---------------------------------------------------------------------------
// Run a single test case against the chat function. Returns:
//   { passed, latencyMs, response, citations, failures: [...reasons] }
// ---------------------------------------------------------------------------

async function runOne(testCase, apiUrl, apiKey) {
  const failures = []
  const start = Date.now()

  let fullResponse = ''
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ message: testCase.query, history: [] }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      failures.push(`HTTP ${response.status}: ${body.slice(0, 200)}`)
      return { passed: false, latencyMs: Date.now() - start, response: '', citations: new Set(), failures }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.content) fullResponse += data.content
          } catch {
            // partial JSON chunk; ignore
          }
        }
      }
    }
  } catch (err) {
    failures.push(`Network/parse error: ${err.message}`)
    return { passed: false, latencyMs: Date.now() - start, response: '', citations: new Set(), failures }
  }

  const latencyMs = Date.now() - start
  const citations = extractCitations(fullResponse)

  // ---- must_cite checks (also accept legacy expected_statutes) ----
  const mustCite = (testCase.must_cite || testCase.expected_statutes || []).map(
    normaliseCitation
  )
  for (const expected of mustCite) {
    if (!citations.has(expected)) {
      failures.push(`missing citation: ${expected}`)
    }
  }

  // ---- must_not_cite checks (the BNS/BNSS/BSA discipline check) ----
  const mustNotCite = (testCase.must_not_cite || []).map(normaliseCitation)
  for (const forbidden of mustNotCite) {
    if (citations.has(forbidden)) {
      failures.push(`forbidden citation present: ${forbidden}`)
    }
  }

  // ---- substring checks ----
  for (const phrase of testCase.must_contain || []) {
    if (!fullResponse.toLowerCase().includes(phrase.toLowerCase())) {
      failures.push(`missing required phrase: "${phrase}"`)
    }
  }
  for (const phrase of testCase.must_not_contain || []) {
    if (fullResponse.toLowerCase().includes(phrase.toLowerCase())) {
      failures.push(`forbidden phrase present: "${phrase}"`)
    }
  }

  // ---- disclaimer check (default ON for citizen tier) ----
  const wantDisclaimer = testCase.must_have_disclaimer !== false
  if (wantDisclaimer) {
    const lc = fullResponse.toLowerCase()
    const hasDisclaimer =
      lc.includes('not legal advice') ||
      lc.includes('legal information') ||
      lc.includes('not a law firm') ||
      lc.includes('advocates act')
    if (!hasDisclaimer) {
      failures.push('disclaimer not present in response')
    }
  }

  // ---- "AI lawyer" framing check (always on) ----
  const lc = fullResponse.toLowerCase()
  if (
    lc.includes('ai lawyer') ||
    lc.includes('replace your lawyer') ||
    lc.includes('i am a lawyer') ||
    lc.includes("i'm a lawyer")
  ) {
    failures.push('response uses prohibited "AI lawyer" framing')
  }

  return {
    passed: failures.length === 0,
    latencyMs,
    response: fullResponse,
    citations: Array.from(citations),
    failures,
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const filePath = path.resolve(values.file)
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`)
    process.exit(1)
  }

  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter((l) => l.trim())
  const cases = []
  for (const [i, line] of lines.entries()) {
    try {
      cases.push(JSON.parse(line))
    } catch (err) {
      console.error(`Line ${i + 1} is not valid JSON: ${err.message}`)
      process.exit(1)
    }
  }

  console.log(`📋 ${cases.length} eval cases loaded from ${path.basename(filePath)}`)
  console.log(`📡 Endpoint: ${values.url}`)
  console.log(`🎯 Pass threshold: ${PASS_THRESHOLD * 100}%`)
  console.log()

  const results = []
  let passCount = 0
  let totalLatency = 0
  const byCategory = {}

  for (const [i, c] of cases.entries()) {
    const id = c.id || `case-${i + 1}`
    const cat = c.category || 'uncategorised'
    process.stdout.write(`[${String(i + 1).padStart(3)}/${cases.length}] ${id.padEnd(30)} `)

    const r = await runOne(c, values.url, API_KEY)
    results.push({ ...c, ...r })
    totalLatency += r.latencyMs
    byCategory[cat] = byCategory[cat] || { pass: 0, fail: 0 }

    if (r.passed) {
      console.log(`✅ ${r.latencyMs}ms`)
      passCount += 1
      byCategory[cat].pass += 1
    } else {
      console.log(`❌ ${r.latencyMs}ms — ${r.failures.join('; ')}`)
      byCategory[cat].fail += 1
      if (VERBOSE) {
        console.log('   response (first 500 chars):')
        console.log(`   ${r.response.slice(0, 500).replace(/\n/g, '\n   ')}`)
        console.log()
      }
    }
  }

  const passRate = passCount / cases.length
  const avgLatency = Math.round(totalLatency / cases.length)

  console.log()
  console.log('=== Summary ===')
  console.log(`Pass: ${passCount}/${cases.length} (${(passRate * 100).toFixed(1)}%)`)
  console.log(`Avg latency: ${avgLatency}ms`)
  console.log()
  console.log('By category:')
  for (const [cat, c] of Object.entries(byCategory).sort()) {
    const tot = c.pass + c.fail
    const r = c.pass / tot
    console.log(`  ${cat.padEnd(18)} ${c.pass}/${tot} (${(r * 100).toFixed(0)}%)`)
  }

  // Write JSON report
  const outDir = path.resolve(__dirname, '..', 'eval-results')
  fs.mkdirSync(outDir, { recursive: true })
  const reportFile =
    values.out || path.join(outDir, `run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  fs.writeFileSync(
    reportFile,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        endpoint: values.url,
        file: filePath,
        pass: passCount,
        total: cases.length,
        passRate,
        avgLatencyMs: avgLatency,
        byCategory,
        results,
      },
      null,
      2
    )
  )
  console.log()
  console.log(`📄 Report: ${path.relative(process.cwd(), reportFile)}`)

  if (passRate < PASS_THRESHOLD) {
    console.log(`\n❌ Pass rate ${(passRate * 100).toFixed(1)}% below threshold ${(PASS_THRESHOLD * 100).toFixed(0)}%`)
    process.exit(1)
  }
  console.log(`\n✅ Pass rate ${(passRate * 100).toFixed(1)}% meets threshold`)
}

main().catch((err) => {
  console.error('Eval runner crashed:', err)
  process.exit(1)
})
