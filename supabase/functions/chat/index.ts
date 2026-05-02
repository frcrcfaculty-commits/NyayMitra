// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const SYSTEM_PROMPT = `You are NyayMitra, an AI-powered legal awareness assistant for Indian citizens.

ROLE:
You help users understand their legal rights in everyday situations by referencing relevant Indian laws and statutes. You are NOT a lawyer and NEVER provide legal advice.

GUIDELINES:
1. Always start responses with relevant statutory references
2. Explain laws in simple, accessible language
3. Provide both Hindi/Marathi translations of key legal terms when relevant
4. Cite specific sections of relevant acts (IPC, CrPC, BNS, BNSS, Consumer Protection Act, etc.)
5. Always end with: "This is for educational purposes only. Please consult a qualified advocate for your specific situation."
6. If unsure about a legal provision, say so clearly — never make up citations
7. Never claim to be a lawyer or legal advisor
8. Refer users to nearest Legal Aid Centre when appropriate
9. Format responses using markdown for readability

RESPONSE FORMAT:
📋 **Relevant Laws:**
- [Act Name], Section [X]: [Brief description]

💡 **Your Rights:**
[Clear explanation in simple language]

⚠️ **What You Can Do:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

📞 **Get Help:**
- National Legal Services Authority: 15100
- Consumer Helpline: 1800-11-4000

---
*This information is for educational purposes only. Please consult a qualified advocate for your specific situation.*`

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { message, history = [] } = await req.json()

    if (!message) {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Build messages array
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-10), // Keep last 10 messages for context
      { role: "user", content: message },
    ]

    // Check for API key
    const apiKey = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("GEMINI_API_KEY")

    if (!apiKey) {
      // Return a helpful static response when no API key is configured
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          const response = `📋 **Note:** The AI chat service is not yet configured with an API key.

To enable AI-powered responses, please set one of the following environment variables:
- \`OPENAI_API_KEY\` — for OpenAI GPT models
- \`GEMINI_API_KEY\` — for Google Gemini models

In the meantime, you can explore the **Know Your Rights** section for pre-written legal scenarios covering:
- 🏠 Tenant Rights
- ⚖️ Filing an FIR
- 🛒 Consumer Complaints
- And more...

📞 **For immediate legal help:**
- National Legal Services Authority: **15100**
- Consumer Helpline: **1800-11-4000**

---
*This information is for educational purposes only. Please consult a qualified advocate for your specific situation.*`

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: response })}\n\n`))
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
          controller.close()
        },
      })

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      })
    }

    // Determine which API to use
    const isGemini = !!Deno.env.get("GEMINI_API_KEY")

    if (isGemini) {
      // Google Gemini API
      const geminiKey = Deno.env.get("GEMINI_API_KEY")!
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: messages.map((m) => ({
              role: m.role === "assistant" ? "model" : m.role === "system" ? "user" : m.role,
              parts: [{ text: m.content }],
            })),
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048,
            },
          }),
        }
      )

      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm unable to generate a response right now."

      // Stream the response
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          // Simulate streaming by chunking the response
          const words = text.split(" ")
          let chunk = ""
          for (let i = 0; i < words.length; i++) {
            chunk += words[i] + " "
            if (i % 5 === 4 || i === words.length - 1) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`))
              chunk = ""
            }
          }
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
          controller.close()
        },
      })

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      })
    } else {
      // OpenAI API with streaming
      const openaiKey = Deno.env.get("OPENAI_API_KEY")!
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
          stream: true,
          temperature: 0.7,
          max_tokens: 2048,
        }),
      })

      // Proxy the SSE stream
      return new Response(response.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      })
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
