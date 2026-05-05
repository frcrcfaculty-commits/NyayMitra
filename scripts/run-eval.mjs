import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseArgs } from 'util'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const options = {
  file: { type: 'string', short: 'f' },
  url: { type: 'string', short: 'u', default: 'http://127.0.0.1:54321/functions/v1/chat' },
  key: { type: 'string', short: 'k' },
}

const { values } = parseArgs({ args: process.argv.slice(2), options })

if (!values.file) {
  console.error('Usage: node run-eval.mjs --file <path-to-jsonl> [--url <edge-function-url>] [--key <supabase-anon-key>]')
  process.exit(1)
}

const API_KEY = values.key || process.env.VITE_SUPABASE_ANON_KEY
if (!API_KEY) {
  console.error('Error: Please provide a Supabase ANON key via --key or VITE_SUPABASE_ANON_KEY env var.')
  process.exit(1)
}

async function runEval() {
  console.log(`Starting Eval Suite...`)
  console.log(`Endpoint: ${values.url}`)
  
  const content = fs.readFileSync(values.file, 'utf-8')
  const testCases = content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))

  let passed = 0
  let failed = 0
  let totalLatency = 0

  for (const [index, testCase] of testCases.entries()) {
    const { query, expected_intent, expected_statutes } = testCase
    console.log(`\n[${index + 1}/${testCases.length}] Testing Query: "${query}"`)
    
    const startTime = Date.now()
    
    try {
      const response = await fetch(values.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
          'X-Eval-Mode': 'true', // Custom header to signal eval mode if needed
        },
        body: JSON.stringify({ message: query, history: [] })
      })

      if (!response.ok) {
        throw new Error(`API responded with status ${response.status}`)
      }

      // Read streaming response to completion
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullResponse = ''
      let finalCitations = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.content) fullResponse += data.content
              if (data.citations) finalCitations = data.citations
            } catch (e) {
              // Ignore partial JSON chunks
            }
          }
        }
      }

      const latency = Date.now() - startTime
      totalLatency += latency
      
      // Basic metrics extraction - in a real scenario we'd parse intent from structured logging or specific eval endpoints
      // For scaffold, we check if the expected statutes appear in citations
      const returnedStatutes = finalCitations.map(c => `${c.act} s.${c.section}`.toLowerCase())
      
      let casePassed = true
      
      if (expected_statutes && expected_statutes.length > 0) {
        const missingStatutes = expected_statutes.filter(es => !returnedStatutes.includes(es.toLowerCase()))
        if (missingStatutes.length > 0) {
          console.log(`❌ Failed: Missing expected statutes: ${missingStatutes.join(', ')}`)
          casePassed = false
        }
      }

      if (casePassed) {
        console.log(`✅ Passed in ${latency}ms`)
        passed++
      } else {
        failed++
      }

    } catch (error) {
      console.log(`❌ Failed with error: ${error.message}`)
      failed++
    }
  }

  console.log('\n=======================================')
  console.log(`Eval Complete.`)
  console.log(`Total Cases: ${testCases.length}`)
  console.log(`Passed: ${passed} (${Math.round(passed/testCases.length*100)}%)`)
  console.log(`Failed: ${failed}`)
  console.log(`Avg Latency: ${Math.round(totalLatency/testCases.length)}ms`)
  console.log('=======================================')
  
  if (failed > 0) process.exit(1)
}

runEval().catch(console.error)
