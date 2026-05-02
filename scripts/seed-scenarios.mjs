/**
 * Seed script: Parse scenario markdown files and insert into Supabase.
 * Usage: node scripts/seed-scenarios.mjs
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
 * (use service role key for seeding, not anon key)
 */

import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCENARIOS_DIR = join(__dirname, '..', 'content', 'scenarios')

// Use local Supabase defaults if no env vars set
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    return { metadata: {}, body: content }
  }

  const metadata = {}
  const lines = match[1].split('\n')
  for (const line of lines) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value = line.slice(colonIdx + 1).trim()

    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    // Parse arrays
    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        metadata[key] = JSON.parse(value)
      } catch {
        metadata[key] = value
      }
    } else if (!isNaN(Number(value)) && value !== '') {
      metadata[key] = Number(value)
    } else {
      metadata[key] = value
    }
  }

  return { metadata, body: match[2].trim() }
}

async function seed() {
  console.log('🌱 Seeding scenarios from', SCENARIOS_DIR)
  console.log('📡 Supabase URL:', SUPABASE_URL)

  const files = readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.md')).sort()
  console.log(`📄 Found ${files.length} scenario files`)

  for (const file of files) {
    const content = readFileSync(join(SCENARIOS_DIR, file), 'utf-8')
    const { metadata, body } = parseFrontmatter(content)

    const row = {
      slug: metadata.slug,
      title: metadata.title,
      title_hi: metadata.title_hi || null,
      title_mr: metadata.title_mr || null,
      summary: body.split('\n\n').slice(0, 2).join(' ').slice(0, 300),
      content: body,
      category: metadata.category,
      icon: metadata.icon || null,
      sort_order: metadata.sort_order || 0,
      is_published: true,
      tags: metadata.tags || [],
    }

    console.log(`  📝 Upserting: ${row.slug} (${row.title})`)

    const { error } = await supabase
      .from('scenarios')
      .upsert(row, { onConflict: 'slug' })

    if (error) {
      console.error(`  ❌ Error seeding ${file}:`, error.message)
    } else {
      console.log(`  ✅ Seeded: ${row.slug}`)
    }
  }

  console.log('\n🎉 Seed complete!')
}

seed().catch(console.error)
