/**
 * Seed script: Parse scenario markdown files and insert into Supabase.
 * Usage: node scripts/seed-scenarios.mjs
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
 * (use service role key for seeding, not anon key)
 *
 * Reads files from content/scenarios/*.md with frontmatter:
 *   slug, title, title_hi, title_mr, category, icon, tags, sort_order,
 *   audience, primary_statute, key_sections, trigger_warning,
 *   in_force_note, last_reviewed, related_statutes
 *
 * Maps frontmatter fields to columns from migrations 20240101000001 (initial)
 * and 20260502000000 (additive). The script uses upsert on `slug`, so re-runs
 * are idempotent and content edits flow through cleanly.
 *
 * If the additive migration hasn't been applied yet, the seed retries with
 * legacy columns only and prints a warning.
 */

import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCENARIOS_DIR = join(__dirname, '..', 'content', 'scenarios')

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  // Local-dev default service role key from supabase/cli — replace in prod
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ---------------------------------------------------------------------------
// Lightweight YAML-style frontmatter parser. Handles the subset we use:
// scalar strings (quoted/unquoted), integers, ISO dates, and inline
// JSON-style arrays of strings. Doesn't pretend to be a full YAML parser.
// ---------------------------------------------------------------------------
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { metadata: {}, body: content }

  const metadata = {}
  const lines = match[1].split(/\r?\n/)
  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue
    const colonIdx = rawLine.indexOf(':')
    if (colonIdx === -1) continue
    const key = rawLine.slice(0, colonIdx).trim()
    let value = rawLine.slice(colonIdx + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    }

    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        const jsonish = value.replace(/'/g, '"')
        metadata[key] = JSON.parse(jsonish)
      } catch {
        const inner = value.slice(1, -1).trim()
        metadata[key] = !inner
          ? []
          : inner
              .split(',')
              .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      }
      continue
    }

    if (/^-?\d+$/.test(value)) {
      metadata[key] = Number(value)
      continue
    }

    metadata[key] = value
  }

  return { metadata, body: match[2].trim() }
}

function buildSummary(body) {
  const cleaned = body
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      if (!t) return true
      if (t.startsWith('#')) return false
      if (t.startsWith('>')) return false
      return true
    })
    .join('\n')

  const paragraphs = cleaned.split(/\n\s*\n/).filter((p) => p.trim().length > 0)
  const summary = paragraphs.slice(0, 2).join(' ').replace(/\s+/g, ' ').trim()
  return summary.slice(0, 500)
}

async function seed() {
  console.log('🌱 Seeding scenarios from', SCENARIOS_DIR)
  console.log('📡 Supabase URL:', SUPABASE_URL)

  const files = readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .sort()
  console.log(`📄 Found ${files.length} scenario files`)

  let ok = 0
  let failed = 0

  for (const file of files) {
    const content = readFileSync(join(SCENARIOS_DIR, file), 'utf-8')
    const { metadata, body } = parseFrontmatter(content)

    if (!metadata.slug || !metadata.title) {
      console.error(`  ❌ ${file}: missing required slug or title`)
      failed += 1
      continue
    }

    const summary = buildSummary(body)

    const fullRow = {
      slug: metadata.slug,
      title: metadata.title,
      title_hi: metadata.title_hi || null,
      title_mr: metadata.title_mr || null,
      summary,
      summary_hi: null,
      summary_mr: null,
      content: body,
      content_hi: null,
      content_mr: null,
      category: metadata.category || 'general',
      icon: metadata.icon || null,
      sort_order: metadata.sort_order || 0,
      is_published: true,
      tags: metadata.tags || [],
      // Fields added in migration 20260502000000:
      key_sections: metadata.key_sections || [],
      primary_statute: metadata.primary_statute || null,
      audience: metadata.audience || 'citizen',
      trigger_warning: metadata.trigger_warning || null,
      in_force_note: metadata.in_force_note || null,
      last_reviewed: metadata.last_reviewed || null,
    }

    process.stdout.write(`  📝 ${String(metadata.slug).padEnd(35)} `)

    let { error } = await supabase
      .from('scenarios')
      .upsert(fullRow, { onConflict: 'slug' })

    if (error && /column .* does not exist/i.test(error.message)) {
      // Additive migration hasn't been applied yet — retry with legacy columns
      const legacyRow = {
        slug: fullRow.slug,
        title: fullRow.title,
        title_hi: fullRow.title_hi,
        title_mr: fullRow.title_mr,
        summary: fullRow.summary,
        summary_hi: fullRow.summary_hi,
        summary_mr: fullRow.summary_mr,
        content: fullRow.content,
        content_hi: fullRow.content_hi,
        content_mr: fullRow.content_mr,
        category: fullRow.category,
        icon: fullRow.icon,
        sort_order: fullRow.sort_order,
        is_published: fullRow.is_published,
        tags: fullRow.tags,
      }
      const retry = await supabase
        .from('scenarios')
        .upsert(legacyRow, { onConflict: 'slug' })
      error = retry.error
      if (!error) {
        console.log(
          '⚠️  legacy-only (apply migration 20260502000000 for full schema)'
        )
        ok += 1
        continue
      }
    }

    if (error) {
      console.log(`❌ ${error.message}`)
      failed += 1
    } else {
      console.log('✅')
      ok += 1
    }
  }

  console.log(`\n🎉 Seed complete: ${ok} ok, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

seed().catch((err) => {
  console.error('💥 seed failed:', err)
  process.exit(1)
})
