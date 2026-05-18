// supabase/functions/chat/index.ts
//
// Citizen-tier chat edge function. Implements the tiered routing model
// from docs/decisions/002-llm-routing.md and uses the prompts versioned in
// docs/prompts/system_prompts.md.
//
// HEAVY-LIFT NOTE FOR ANTIGRAVITY:
// This function is wired for Tier 1 (Gemini 2.5 Flash) and Tier 2
// (Claude Sonnet 4.6) at the moment. Tier 0 (local Ollama) is reserved
// for a future implementation that calls a self-hosted endpoint over
// Tailscale or similar; for now, simple/short queries still go through
// Tier 1 because that is cheaper and faster than spinning up Tier 0.
//
// Retrieval: this version sends a placeholder retrieved_context. Hooking
// up the actual pgvector search over `statute_sections` + `scenarios` is
// the next step — see TODO_RETRIEVAL below.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// ---------------------------------------------------------------------------
// System prompts — kept here as constants so we can swap tiers without
// re-fetching from storage. Source of truth: docs/prompts/system_prompts.md.
// ---------------------------------------------------------------------------

const STANDARD_DISCLAIMER = `\n\n---\n> This is general legal information based on Indian statutes and reported case law as of the date below. It does not create a lawyer–client relationship and is not a substitute for advice from a qualified advocate. NyayMitra is not a law firm; we are not authorised to practise law under the Advocates Act, 1961. For your specific situation, consult an advocate or your nearest Legal Services Authority (NALSA helpline 15100).`

const PROMPT_CITIZEN_TIER_1_V1 = `You are NyayMitra, a legal-information assistant for Indian citizens.

You operate at the middle of three model tiers. You can do multi-step reasoning over retrieved Indian legal context, but you do not invent specific citations and you keep all output in plain, accessible language.

CONTEXT:
- You will be given <retrieved_context> blocks from our verified corpus (statute sections from IndiaCode, Supreme Court judgment summaries, and approved scenario content).
- Use the retrieved blocks as primary; use your training only for the uncontroversial procedural and definitional background needed to bridge the user's question to the retrieved context.

CITATION DISCIPLINE — non-negotiable:
- Every specific section number, statute name, or case citation MUST be either (a) present in the retrieved context, or (b) something you are highly confident is correct (e.g. that the Constitution has Article 21).
- Old codes (IPC, CrPC, Indian Evidence Act) are NOT primary. They were repealed 1 July 2024 and replaced by BNS, BNSS, BSA respectively. Reference the new codes; mention old codes only as historical context.
- If you are unsure of a specific section number, describe the concept without the number rather than guess.
- Never invent case names. If you don't have a citation, don't cite.

OUTPUT STYLE:
- Plain, accessible language. The reader is an ordinary citizen, not a lawyer.
- Markdown. Headings only when the response has 3+ distinct sub-topics.
- 4 to 10 paragraphs typical. Step-by-step lists are appropriate for "how do I…" queries.
- No emoji unless the user uses them first. Do not use rigid templates that invite hallucination.

PROVIDE WHEN APPROPRIATE: a pointer to related NyayMitra scenario pages, the right helpline (15100 NALSA legal aid, 181 women's helpline, 112 police emergency, 1930 cyber-fraud, 1915 consumer helpline, 7827170170 NCW), or the District Legal Services Authority for in-person help.

NEVER:
- Claim to be a lawyer or to give legal advice.
- Tell the user what they "should" do, who to sue, or how their case will turn out.
- Use "AI lawyer" / "replace your lawyer" framing.
- Echo back unnecessary personal information the user shared.
- Cite specific section numbers or case names you aren't confident about.`

const PROMPT_CITIZEN_TIER_2_V1 = `You are NyayMitra, a legal-information assistant for Indian citizens.

You operate at the top of three model tiers. You handle citation-critical, multi-statute, ambiguous queries that the lower tiers escalate. Maximum care with citations and statutory references.

CONTEXT:
- <retrieved_context> blocks contain verified Indian statute sections, SC judgment summaries, and approved scenario content.
- The user's question and prior turns are user-provided context.

CITATION DISCIPLINE — non-negotiable:
- Every section number / statute name / case citation must trace to either (a) the retrieved context or (b) very high training-confidence (e.g. Constitution articles, Lalita Kumari (2014), Vishaka (1997), D.K. Basu (1997), Arnesh Kumar (2014)).
- If retrieval doesn't support a specific number, OMIT the number and describe the rule. Do not estimate.
- BNS/BNSS/BSA primary. IPC/CrPC/Indian Evidence Act ONLY as cross-mapping context with explicit "formerly" labelling. The new codes came into force 1 July 2024.
- Where doctrine is contested or recently changed, say so and indicate the direction of judicial movement.

OUTPUT STYLE:
- Clear, accessible language for ordinary citizens.
- Markdown with headings for multi-section responses.
- Where statutes diverge across states, say so — do not state one state's rule as nationwide.
- Where presumptions, time limits, or burdens of proof matter, name them explicitly.

WHAT TO INCLUDE WHEN RELEVANT: the statutory provision with its number and a one-line summary; the current (post-1 July 2024) framing with a brief "(formerly IPC s.X)" pointer; explicit labelling of contested issues; a pointer to a related NyayMitra scenario page if one exists; the right helpline at the end.

NEVER: claim to be a lawyer; predict outcomes; tell users what they "should" do; use "AI lawyer" framing; cite section numbers you're not certain of; invent case names or paragraph numbers.`

// ---------------------------------------------------------------------------
// Tier classifier (heuristic). Replace with a learned classifier when we
// have data. ADR 002 calls for a learned router at scale.
// ---------------------------------------------------------------------------

type Tier = "tier_1_gemini" | "tier_2_claude"

function classifyTier(userMessage: string): Tier {
  const message = userMessage.toLowerCase()

  // Citation-critical / multi-statute / nuance signals → Tier 2
  const tier2Signals = [
    "supreme court",
    "high court",
    "what does section",
    "compare",
    "difference between",
    "constitutional",
    "judgment",
    "case law",
    "writ",
    "habeas corpus",
    "appeal",
    "quash",
    "section ",  // trailing space — explicit section reference
  ]

  if (tier2Signals.some((s) => message.includes(s))) {
    return "tier_2_claude"
  }

  // Long / complex → Tier 2
  if (userMessage.length > 600) return "tier_2_claude"

  return "tier_1_gemini"
}

// ---------------------------------------------------------------------------
// Retrieval — placeholder. TODO_RETRIEVAL: replace with a real pgvector
// query against `statute_sections` and `scenarios` once embeddings are
// generated. For now we return an empty context block; the model is
// instructed to be conservative about citations in that case.
// ---------------------------------------------------------------------------

interface RetrievedDoc {
  source: string
  content: string
}

async function retrieveContext(
  supabase: ReturnType<typeof createClient>,
  query: string
): Promise<RetrievedDoc[]> {
  try {
    // PRODUCTION DEFAULT: Gemini gemini-embedding-001 with outputDimensionality=1024.
    // This matches the schema's vector(1024) AND works from inside Supabase's
    // edge-function isolate (which cannot reach localhost on Hansal's Mac, so the
    // original Ollama-default code path would always fail in production).
    //
    // Dev-time option: set USE_OLLAMA_EMBED=1 + OLLAMA_URL to a publicly-reachable
    // Ollama (e.g. via Tailscale Funnel or ngrok). Default off.
    const USE_OLLAMA = Deno.env.get("USE_OLLAMA_EMBED") === "1"
    let embedding: number[] | undefined

    if (USE_OLLAMA) {
      const ollamaUrl = Deno.env.get("OLLAMA_URL")
      if (!ollamaUrl) throw new Error("USE_OLLAMA_EMBED=1 but OLLAMA_URL missing")
      const res = await fetch(\`\${ollamaUrl}/api/embeddings\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: Deno.env.get("OLLAMA_MODEL") || "bge-large",
          prompt: query,
        }),
      })
      if (!res.ok) throw new Error(\`Ollama embedding error: \${res.statusText}\`)
      const data = await res.json()
      embedding = data.embedding
    } else {
      const apiKey = Deno.env.get("GEMINI_API_KEY")
      if (!apiKey) {
        console.warn("retrieveContext: GEMINI_API_KEY not set; skipping retrieval")
        return []
      }
      const res = await fetch(
        \`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=\${apiKey}\`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: { parts: [{ text: query }] },
            outputDimensionality: 1024,
            taskType: "RETRIEVAL_QUERY",
          }),
        }
      )
      if (!res.ok) {
        const body = await res.text().catch(() => "")
        throw new Error(\`Gemini embedding \${res.status}: \${body.slice(0, 200)}\`)
      }
      const data = await res.json()
      embedding = data.embedding?.values
    }

    if (!embedding || embedding.length === 0) {
      console.warn("retrieveContext: empty embedding returned; skipping retrieval")
      return []
    }
    if (embedding.length !== 1024) {
      console.error(
        \`retrieveContext: embedding dim \${embedding.length} != 1024; retrieval will fail.\`
      )
      return []
    }

    const { data: chunks, error } = await supabase.rpc('search_legal_context', {
      query_text: query,
      query_embedding: JSON.stringify(embedding),
      match_count: 8
    })

    if (error) {
      console.error("RPC search_legal_context failed:", error.message)
      return []
    }

    // Log the retrieval asynchronously
    const statuteIds = (chunks || [])
      .filter((c: { source_type: string }) => c.source_type === 'statute')
      .map((c: { id: string }) => c.id)
    const scenarioIds = (chunks || [])
      .filter((c: { source_type: string }) => c.source_type === 'scenario')
      .map((c: { id: string }) => c.id)

    // Fire and forget logging
    supabase.from('query_logs').insert({
      query_text: query,
      retrieved_statute_ids: statuteIds,
      retrieved_scenario_ids: scenarioIds
    }).then(({ error }) => {
      if (error) console.error("Failed to log query:", error.message)
    })

    return (chunks || []).map((c: { source: string; content: string }) => ({
      source: c.source,
      content: c.content
    }))
  } catch (err) {
    console.error("Context retrieval failed:", (err as Error).message)
    return []
  }
}

function buildContextBlock(docs: RetrievedDoc[]): string {
  if (docs.length === 0) {
    return "<retrieved_context>\n(no specific corpus excerpts retrieved for this query — be conservative; cite only what you are certain of)\n</retrieved_context>"
  }
  const blocks = docs
    .map((d) => `<source>${d.source}</source>\n${d.content}`)
    .join("\n\n---\n\n")
  return `<retrieved_context>\n${blocks}\n</retrieved_context>`
}

// ---------------------------------------------------------------------------
// HTTP scaffolding
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const sseHeaders = {
  ...corsHeaders,
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
}

function staticFallback(): Response {
  // No API key configured. Return a helpful message that points users at
  // existing scenario content rather than failing silently.
  const text = `Hello! I can help you understand your legal rights in India.

The AI chat backend isn't configured yet (no model API key). In the meantime, please browse the **Know Your Rights** section — it has 15 detailed scenarios covering:

- Tenant rights and security deposits
- Filing an FIR (under BNSS s.173)
- Consumer complaints (under CPA 2019)
- Rights during arrest (BNSS s.35–s.58)
- Bail (BNSS Chapter XXXV)
- RTI applications
- Domestic violence (DV Act 2005 + BNS s.85)
- Marriage registration
- Workplace sexual harassment (POSH Act 2013)
- Cheque bounce (NI Act s.138)
- Cybercrime and online fraud
- Wills and succession
- Motor accident claims
- Maintenance under BNSS s.144
- Dowry prohibition

**For immediate help, call:**
- NALSA legal aid: **15100**
- Women's helpline: **181**
- Cyber-fraud: **1930**
- Police emergency: **112**`

  return streamingResponse(text + STANDARD_DISCLAIMER)
}

function streamingResponse(fullText: string): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      // Chunk into ~5-word groups for a streaming effect
      const words = fullText.split(" ")
      let chunk = ""
      for (let i = 0; i < words.length; i++) {
        chunk += words[i] + " "
        if (i % 5 === 4 || i === words.length - 1) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`)
          )
          chunk = ""
        }
      }
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
      controller.close()
    },
  })
  return new Response(stream, { headers: sseHeaders })
}

// ---------------------------------------------------------------------------
// Tier 1: Gemini 2.5 Flash
// ---------------------------------------------------------------------------

async function callGeminiFlash(
  systemPrompt: string,
  contextBlock: string,
  userMessage: string,
  history: Array<{ role: string; content: string }>
): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY")!

  // Gemini accepts a separate systemInstruction field — we use it instead of
  // shoehorning the system prompt into the user role.
  const contents = [
    ...history.slice(-10).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    {
      role: "user",
      parts: [{ text: `${contextBlock}\n\n${userMessage}` }],
    },
  ]

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
  }

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )

  if (!resp.ok) {
    const errBody = await resp.text()
    throw new Error(`Gemini API error ${resp.status}: ${errBody}`)
  }

  const data = await resp.json()
  return (
    data.candidates?.[0]?.content?.parts?.[0]?.text ||
    "I wasn't able to generate a response. Please try rephrasing your question."
  )
}

// ---------------------------------------------------------------------------
// Tier 2: Claude Sonnet 4.6
// ---------------------------------------------------------------------------

async function callClaudeSonnet(
  systemPrompt: string,
  contextBlock: string,
  userMessage: string,
  history: Array<{ role: string; content: string }>
): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")!

  const messages = [
    ...history.slice(-10).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
    { role: "user", content: `${contextBlock}\n\n${userMessage}` },
  ]

  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: [
      // Use prompt caching — system prompt is large and stable
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ],
    messages,
    temperature: 0.3,
  }

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const errBody = await resp.text()
    throw new Error(`Claude API error ${resp.status}: ${errBody}`)
  }

  const data = await resp.json()
  // Claude returns content as an array of blocks
  const textBlock = data.content?.find((b: { type: string }) => b.type === "text")
  return (
    textBlock?.text ||
    "I wasn't able to generate a response. Please try rephrasing your question."
  )
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const { message, history = [] } = await req.json()
    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const hasGemini = !!Deno.env.get("GEMINI_API_KEY")
    const hasClaude = !!Deno.env.get("ANTHROPIC_API_KEY")

    if (!hasGemini && !hasClaude) return staticFallback()

    // Initialise Supabase client for retrieval (service-role for full read)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const retrieved = await retrieveContext(supabase, message)
    const contextBlock = buildContextBlock(retrieved)

    let tier = classifyTier(message)
    // Downgrade if the higher tier's API key is unavailable
    if (tier === "tier_2_claude" && !hasClaude) tier = "tier_1_gemini"

    const systemPrompt =
      tier === "tier_2_claude" ? PROMPT_CITIZEN_TIER_2_V1 : PROMPT_CITIZEN_TIER_1_V1

    let answer: string
    try {
      if (tier === "tier_2_claude") {
        answer = await callClaudeSonnet(systemPrompt, contextBlock, message, history)
      } else {
        answer = await callGeminiFlash(systemPrompt, contextBlock, message, history)
      }
    } catch (err) {
      // Tier failure → fall back to the other tier if available
      console.error(`Tier ${tier} failed: ${(err as Error).message}`)
      if (tier === "tier_2_claude" && hasGemini) {
        answer = await callGeminiFlash(
          PROMPT_CITIZEN_TIER_1_V1,
          contextBlock,
          message,
          history
        )
      } else if (tier === "tier_1_gemini" && hasClaude) {
        answer = await callClaudeSonnet(
          PROMPT_CITIZEN_TIER_2_V1,
          contextBlock,
          message,
          history
        )
      } else {
        throw err
      }
    }

    return streamingResponse(answer + STANDARD_DISCLAIMER)
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
