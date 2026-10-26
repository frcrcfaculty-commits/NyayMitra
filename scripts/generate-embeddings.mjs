#!/usr/bin/env node
/**
 * scripts/generate-embeddings.mjs
 *
 * Generate pgvector embeddings for statutes and scenarios.
 *
 * Originally written by Antigravity-A. This rewrite (by Claude) fixes:
 *   1. Dimension mismatch — script now hard-asserts the embedding dimension
 *      matches the schema (1024) before any INSERT, failing fast instead of
 *      silently inserting nothing
 *   2. Silent error swallowing — failures are tracked separately from
 *      completions; the script exits non-zero if too many rows failed
 *   3. Race-free chunked UPDATE — uses a single transaction per statute
 *   4. Adds --table flag (scenarios | statutes | chunks | all) so you can
 *      smoke-test on the small scenarios table before touching statutes
 *   5. Per-provider BATCH_SIZE — local Ollama serializes anyway, so we
 *      keep concurrency low (4) for Ollama and higher (10) for cloud APIs
 *   6. Smarter chunking — split on paragraph/sentence boundaries when
 *      possible, falling back to char-based slicing
 *
 * USAGE
 *   node scripts/generate-embeddings.mjs [options]
 *
 * OPTIONS
 *   --table {scenarios|statutes|chunks|all}   default: all
 *   --dry-run                                  Show what would be processed
 *   --limit N                                  Process at most N rows
 *   --provider {ollama|gemini}                 default: ollama if OLLAMA_URL
 *                                              set, gemini if GEMINI_API_KEY
 *                                              set, else error
 *   --model NAME                               Override model name
 *
 * ENV
 *   SUPABASE_URL                   required
 *   SUPABASE_SERVICE_ROLE_KEY      required
 *   OLLAMA_URL                     for Ollama (default http://localhost:11434)
 *   GEMINI_API_KEY                 for Gemini fallback
 *
 * RECOMMENDED FLOW
 *   1. node scripts/generate-embeddings.mjs --dry-run                    # see counts
 *   2. node scripts/generate-embeddings.mjs --table scenarios            # 15 rows
 *   3. node scripts/generate-embeddings.mjs --table statutes --limit 20  # smoke
 *   4. node scripts/generate-embeddings.mjs --table all                  # full
 */

import { createClient } from '@supabase/supabase-js'
import { parseArgs } from 'util'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const EXPECTED_DIM = 1024
const CHUNK_SIZE = 2000
const CHUNK_OVERLAP = 200

const args = parseArgs({
  args: process.argv.slice(2),
  options: {
    table: { type: 'string', default: 'all' },
    'dry-run': { type: 'boolean', default: false },
    limit: { type: 'string' },
    provider: { type: 'string' },
    model: { type: 'string' },
  },
})

const TABLE = args.values.table
const DRY_RUN = args.values['dry-run']
const LIMIT = args.values.limit ? parseInt(args.values.limit, 10) : null

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}
if (!['scenarios', 'statutes', 'chunks', 'all'].includes(TABLE)) {
  console.error(`❌ --table must be one of: scenarios, statutes, chunks, all (got "${TABLE}")`)
  process.exit(1)
}

// Auto-detect provider
let PROVIDER = args.values.provider
if (!PROVIDER) {
  if (process.env.EMBEDDING_FALLBACK === 'cloud' || (GEMINI_API_KEY && !OLLAMA_URL)) {
    PROVIDER = 'gemini'
  } else {
    PROVIDER = 'ollama'
  }
}
const MODEL = args.values.model || (PROVIDER === 'ollama' ? 'bge-large' : 'text-embedding-004')

const BATCH_SIZE = PROVIDER === 'ollama' ? 4 : 10

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
})

// ---------------------------------------------------------------------------
// Embedding providers
// ---------------------------------------------------------------------------

async function embedOllama(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt: text }),
  })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text().catch(() => '')}`)
  const data = await res.json()
  if (!Array.isArray(data.embedding)) {
    throw new Error(`Ollama returned no embedding field. Is model "${MODEL}" pulled?`)
  }
  return data.embedding
}

async function embedGemini(text) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required for Gemini provider')
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${GEMINI_API_KEY}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: { parts: [{ text }] } }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text().catch(() => '')}`)
  const data = await res.json()
  return data.embedding?.values
}

async function generateEmbedding(text) {
  const embedding = PROVIDER === 'ollama' ? await embedOllama(text) : await embedGemini(text)
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error(`Provider returned empty embedding for input "${text.slice(0, 60)}..."`)
  }
  return embedding
}

// ---------------------------------------------------------------------------
// Dimension assertion — done ONCE at startup, fails fast
// ---------------------------------------------------------------------------

async function assertDimensionMatch() {
  console.log(`🔍 Probing ${PROVIDER}/${MODEL} for embedding dimension...`)
  const sample = await generateEmbedding('NyayMitra dimension probe')
  if (sample.length !== EXPECTED_DIM) {
    console.error(
      `\n❌ DIMENSION MISMATCH: provider returned ${sample.length}-dim vectors, schema expects ${EXPECTED_DIM}.\n` +
        `\nPossible fixes:\n` +
        `  1. Use a 1024-dim model:\n` +
        `     - Ollama: 'bge-large' (1024) or 'mxbai-embed-large' (1024)\n` +
        `     - Gemini: 'gemini-embedding-001' (supports task-type config and 1024 output via outputDimensionality)\n` +
        `  2. OR add a new migration that ALTERs the embedding columns to match.\n`
    )
    process.exit(1)
  }
  console.log(`✅ Dimension matches (${EXPECTED_DIM}). Proceeding.\n`)
}

// ---------------------------------------------------------------------------
// Chunking — paragraph/sentence-aware
// ---------------------------------------------------------------------------

function chunkText(text) {
  if (!text || text.length <= CHUNK_SIZE) return text ? [text] : []
  const chunks = []
  let pos = 0
  while (pos < text.length) {
    let end = Math.min(pos + CHUNK_SIZE, text.length)
    if (end < text.length) {
      // Prefer paragraph break, then sentence, then space
      const slice = text.slice(pos, end)
      const paraBreak = slice.lastIndexOf('\n\n')
      const sentBreak = slice.lastIndexOf('. ')
      const spaceBreak = slice.lastIndexOf(' ')
      const breakAt =
        paraBreak > CHUNK_SIZE * 0.5
          ? paraBreak + 2
          : sentBreak > CHUNK_SIZE * 0.5
            ? sentBreak + 2
            : spaceBreak > 0
              ? spaceBreak + 1
              : CHUNK_SIZE
      end = pos + breakAt
    }
    chunks.push(text.slice(pos, end).trim())
    pos = Math.max(end - CHUNK_OVERLAP, pos + 1)
  }
  return chunks.filter((c) => c.length > 0)
}

// ---------------------------------------------------------------------------
// Concurrency control + error tracking (FIXES BUG 2: errors counted now)
// ---------------------------------------------------------------------------

async function processWithSemaphore(items, processFn, label = 'items') {
  let active = 0
  let index = 0
  let completed = 0
  let failed = 0
  const total = items.length
  const failures = []

  return new Promise((resolve) => {
    if (total === 0) return resolve({ completed, failed, failures })
    const tick = () => {
      if (completed + failed === total) {
        return resolve({ completed, failed, failures })
      }
      while (active < BATCH_SIZE && index < total) {
        const item = items[index++]
        active++
        processFn(item)
          .then(() => {
            completed++
          })
          .catch((err) => {
            failed++
            failures.push({ id: item.id || item.slug, error: err.message })
          })
          .finally(() => {
            active--
            const done = completed + failed
            if (done % 25 === 0 || done === total) {
              const pct = Math.round((done / total) * 100)
              console.log(
                `  ${done}/${total} ${label} (${pct}%) — ${completed} ok, ${failed} failed`
              )
            }
            tick()
          })
      }
    }
    tick()
  })
}

// ---------------------------------------------------------------------------
// Per-table processors
// ---------------------------------------------------------------------------

async function processScenarios() {
  console.log('\n📚 Scenarios')
  let q = supabase
    .from('scenarios')
    .select('id, slug, title, summary, content')
    .is('embedding', null)
  if (LIMIT) q = q.limit(LIMIT)
  const { data, error } = await q
  if (error) throw new Error(`Scenarios query failed: ${error.message}`)
  console.log(`  ${data.length} scenarios pending`)
  if (DRY_RUN) return { completed: 0, failed: 0, failures: [] }

  return processWithSemaphore(
    data,
    async (s) => {
      const text = [s.title, s.summary, s.content].filter(Boolean).join('\n\n').slice(0, 8000)
      const embedding = await generateEmbedding(text)
      const { error: upErr } = await supabase
        .from('scenarios')
        .update({ embedding })
        .eq('id', s.id)
      if (upErr) throw new Error(upErr.message)
    },
    'scenarios'
  )
}

async function processStatutes() {
  console.log('\n⚖️  Statutes (parent-row embeddings)')
  let q = supabase.from('statutes').select('id, title, full_text').is('embedding', null)
  if (LIMIT) q = q.limit(LIMIT)
  const { data, error } = await q
  if (error) throw new Error(`Statutes query failed: ${error.message}`)
  console.log(`  ${data.length} statutes pending`)
  if (DRY_RUN) return { completed: 0, failed: 0, failures: [] }

  return processWithSemaphore(
    data,
    async (s) => {
      const text = `${s.title}\n${(s.full_text || '').slice(0, 200)}`
      const embedding = await generateEmbedding(text)
      const { error: upErr } = await supabase
        .from('statutes')
        .update({ embedding })
        .eq('id', s.id)
      if (upErr) throw new Error(upErr.message)
    },
    'statutes'
  )
}

async function processChunks() {
  console.log('\n🧩 Statute section chunks (RAG sub-units)')
  // Find statutes with full_text > CHUNK_SIZE that don't have chunks yet
  const { data: candidates, error } = await supabase
    .from('statutes')
    .select('id, full_text')
    .not('full_text', 'is', null)
  if (error) throw new Error(`Chunks candidate query failed: ${error.message}`)

  const needsChunks = candidates.filter((s) => (s.full_text || '').length > CHUNK_SIZE)
  console.log(`  ${needsChunks.length} statutes have full_text > ${CHUNK_SIZE} chars`)

  // For each, check whether chunks already exist (cheap roundtrip per statute)
  const work = []
  for (const s of needsChunks) {
    const { count } = await supabase
      .from('statute_section_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('statute_id', s.id)
    if ((count || 0) === 0) work.push(s)
  }
  console.log(`  ${work.length} statutes need chunking`)
  if (LIMIT && work.length > LIMIT) work.length = LIMIT
  if (DRY_RUN) return { completed: 0, failed: 0, failures: [] }

  return processWithSemaphore(
    work,
    async (s) => {
      const chunks = chunkText(s.full_text)
      const rows = []
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await generateEmbedding(chunks[i])
        rows.push({
          statute_id: s.id,
          chunk_index: i,
          chunk_text: chunks[i],
          embedding,
        })
      }
      const { error: upErr } = await supabase
        .from('statute_section_chunks')
        .upsert(rows, { onConflict: 'statute_id,chunk_index' })
      if (upErr) throw new Error(upErr.message)
    },
    'statutes-with-chunks'
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== NyayMitra embedding generation ===')
  console.log(`Provider: ${PROVIDER}`)
  console.log(`Model:    ${MODEL}`)
  console.log(`Table:    ${TABLE}`)
  console.log(`Supabase: ${SUPABASE_URL}`)
  console.log(`Dry run:  ${DRY_RUN}`)
  console.log(`Limit:    ${LIMIT || 'none'}\n`)

  if (!DRY_RUN) await assertDimensionMatch()

  const results = { completed: 0, failed: 0, failures: [] }

  const runOne = async (fn) => {
    const r = await fn()
    results.completed += r.completed
    results.failed += r.failed
    results.failures.push(...r.failures)
  }

  if (TABLE === 'scenarios' || TABLE === 'all') await runOne(processScenarios)
  if (TABLE === 'statutes' || TABLE === 'all') await runOne(processStatutes)
  if (TABLE === 'chunks' || TABLE === 'all') await runOne(processChunks)

  console.log('\n=== Summary ===')
  console.log(`Completed: ${results.completed}`)
  console.log(`Failed:    ${results.failed}`)
  if (results.failures.length > 0) {
    console.log('\nFirst 10 failures:')
    for (const f of results.failures.slice(0, 10)) {
      console.log(`  ${f.id}: ${f.error}`)
    }
  }

  // FIXES BUG 2: Exit non-zero if a meaningful fraction failed.
  const total = results.completed + results.failed
  if (total > 0 && results.failed / total > 0.1) {
    console.error(`\n❌ More than 10% failed (${results.failed}/${total}). Exiting non-zero.`)
    process.exit(1)
  }

  console.log('\n🎉 Embedding generation complete.')
}

main().catch((err) => {
  console.error('\n💥 Fatal error:', err.message || err)
  console.error(err.stack)
  process.exit(1)
})
