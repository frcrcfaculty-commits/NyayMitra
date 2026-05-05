import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const USE_CLOUD_FALLBACK = process.env.EMBEDDING_FALLBACK === 'cloud'
const BATCH_SIZE = 10 // Max concurrent requests to Ollama/API
const CHUNK_SIZE = 2000
const CHUNK_OVERLAP = 200

if (!SUPABASE_KEY) {
  console.warn("⚠️  SUPABASE_SERVICE_ROLE_KEY not set. This script requires service-role privileges.")
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function generateEmbedding(text) {
  if (USE_CLOUD_FALLBACK) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error("GEMINI_API_KEY is required when EMBEDDING_FALLBACK=cloud")
    const res = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=\${apiKey}\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] }
      })
    })
    if (!res.ok) throw new Error(\`Cloud API error: \${res.statusText}\`)
    const data = await res.json()
    return data.embedding?.values
  }

  // Local Ollama
  const res = await fetch(\`\${OLLAMA_URL}/api/embeddings\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'bge-large',
      prompt: text
    })
  })
  
  if (!res.ok) throw new Error(\`Ollama API error: \${res.statusText}\`)
  const data = await res.json()
  return data.embedding
}

function chunkText(text) {
  if (!text || text.length <= CHUNK_SIZE) return [text]
  const chunks = []
  let i = 0
  while (i < text.length) {
    chunks.push(text.slice(i, i + CHUNK_SIZE))
    i += (CHUNK_SIZE - CHUNK_OVERLAP)
  }
  return chunks
}

async function processWithSemaphore(items, processFn) {
  let active = 0
  let index = 0
  let completed = 0
  let total = items.length

  return new Promise((resolve) => {
    function next() {
      if (completed === total) {
        return resolve()
      }
      while (active < BATCH_SIZE && index < total) {
        const item = items[index++]
        active++
        processFn(item).then(() => {
          completed++
          active--
          if (completed % 50 === 0 || completed === total) {
            console.log(\`\${completed}/\${total} embedded (\${Math.round((completed / total) * 100)}%)\`)
          }
          next()
        }).catch(err => {
          completed++
          active--
          console.error(\`❌ Error processing item \${item.id || item.slug}: \${err.message}\`)
          next()
        })
      }
    }
    next()
  })
}

async function embedStatutes(dryRun = false, limit = null) {
  console.log("Fetching statutes...")
  let query = supabase.from('statutes').select('id, title, full_text').is('embedding', null)
  if (limit) query = query.limit(limit)

  const { data: statutes, error } = await query
  if (error) throw error

  console.log(\`Found \${statutes.length} statutes missing embeddings.\`)
  if (dryRun) return

  await processWithSemaphore(statutes, async (statute) => {
    const parentText = \`\${statute.title}\\n\${(statute.full_text || '').slice(0, 200)}\`
    const parentEmbedding = await generateEmbedding(parentText)

    if (statute.full_text && statute.full_text.length > CHUNK_SIZE) {
      const chunks = chunkText(statute.full_text)
      for (let i = 0; i < chunks.length; i++) {
        const chunkEmbedding = await generateEmbedding(chunks[i])
        await supabase.from('statute_section_chunks').upsert({
          statute_id: statute.id,
          chunk_index: i,
          chunk_text: chunks[i],
          embedding: chunkEmbedding
        }, { onConflict: 'statute_id, chunk_index' })
      }
    }

    await supabase.from('statutes').update({ embedding: parentEmbedding }).eq('id', statute.id)
  })
}

async function embedScenarios(dryRun = false, limit = null) {
  console.log("Fetching scenarios...")
  let query = supabase.from('scenarios').select('id, slug, title, summary, content').is('embedding', null)
  if (limit) query = query.limit(limit)

  const { data: scenarios, error } = await query
  if (error) throw error

  console.log(\`Found \${scenarios.length} scenarios missing embeddings.\`)
  if (dryRun) return

  await processWithSemaphore(scenarios, async (scenario) => {
    const textToEmbed = \`\${scenario.title}\\n\${scenario.summary || ''}\\n\${scenario.content || ''}\`
    const embedding = await generateEmbedding(textToEmbed)
    await supabase.from('scenarios').update({ embedding }).eq('id', scenario.id)
  })
}

async function main() {
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')
  const limitIdx = args.indexOf('--limit')
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null

  if (isDryRun) console.log("DRY RUN MODE: No embeddings will be generated or saved.")
  if (USE_CLOUD_FALLBACK) console.log("Using Cloud Fallback (Gemini API) for embeddings.")
  else console.log(\`Using local Ollama at \${OLLAMA_URL} for embeddings.\`)

  try {
    await embedStatutes(isDryRun, limit)
    await embedScenarios(isDryRun, limit)
    console.log("🎉 Embedding generation complete.")
  } catch (err) {
    console.error("💥 Fatal error during embedding generation:", err)
    process.exit(1)
  }
}

main()
