import { useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Bot, User, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useChatStore, type Message } from '@/store/chatStore'
import { CitationBadge } from '@/components/CitationBadge'

export default function ChatPage() {
  const { t } = useTranslation()
  const {
    messages,
    input,
    isStreaming,
    setInput,
    setIsStreaming,
    addMessage,
    updateAssistantMessage,
  } = useChatStore()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    addMessage(userMessage)
    setInput('')
    setIsStreaming(true)

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      citations: [],
      timestamp: new Date(),
    }

    addMessage(assistantMessage)

    try {
      const functionsUrl = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL
      const response = await fetch(`${functionsUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          message: userMessage.content,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      if (!response.ok) {
        throw new Error(`Chat service unavailable (${response.status})`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        let fullContent = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                if (parsed.content) {
                  fullContent += parsed.content
                  updateAssistantMessage(assistantMessage.id, fullContent)
                }
                if (parsed.citations) {
                  updateAssistantMessage(assistantMessage.id, fullContent, parsed.citations)
                }
              } catch {
                // partial JSON, skip
              }
            }
          }
        }
      }
    } catch (error) {
      // On error, show a fallback response
      const errorContent = `I'm currently unable to connect to the chat service. This could be because:

1. The Supabase edge function isn't running yet
2. The local development server needs to be started with \`supabase start\`

In the meantime, you can browse the **Know Your Rights** section for pre-written legal scenarios.

---
*${t('disclaimer.short')}*`

      updateAssistantMessage(assistantMessage.id, errorContent)
    } finally {
      setIsStreaming(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem-8rem)]">
      {/* Chat Header */}
      <div className="border-b bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-xl font-bold">
            <span className="gradient-text">{t('chat.title')}</span>
          </h1>
          <p className="text-sm text-muted-foreground">{t('chat.subtitle')}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 py-6 space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-emerald-600 flex items-center justify-center mb-4">
                <Bot className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-semibold mb-2">{t('chat.title')}</h2>
              <p className="text-muted-foreground text-sm max-w-md mb-8">{t('chat.subtitle')}</p>

              {/* Suggested questions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                {[
                  'My landlord is not returning my security deposit. What can I do?',
                  'How do I file an FIR if police refuse?',
                  'What are my rights as a consumer if a product is defective?',
                  'How does the Right to Information (RTI) work?',
                ].map((q, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(q)
                      inputRef.current?.focus()
                    }}
                    className="text-left p-3 rounded-lg border hover:bg-accent hover:border-primary/20 transition-all text-sm text-muted-foreground hover:text-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-gradient-to-br from-orange-500 to-emerald-600 text-white'
                }`}
              >
                {message.role === 'user' ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>

              {/* Content */}
              <div className={`flex-1 max-w-[85%] ${message.role === 'user' ? 'text-right' : ''}`}>
                <div
                  className={`inline-block rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-md'
                      : 'bg-muted rounded-tl-md'
                  }`}
                >
                  {message.role === 'assistant' && message.content === '' ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('chat.thinking')}
                    </div>
                  ) : message.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm">{message.content}</p>
                  )}
                </div>

                {/* Citations */}
                {message.citations && message.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.citations.map((citation, i) => (
                      <CitationBadge
                        key={i}
                        citation={`${citation.act} s.${citation.section}`}
                        href={citation.url || undefined}
                        verified={citation.verified}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Chat disclaimer */}
      <div className="border-t bg-amber-50/50 dark:bg-amber-950/20">
        <div className="container mx-auto px-4 py-1.5">
          <p className="text-[11px] text-center text-amber-700 dark:text-amber-400">
            {t('chat.disclaimer_chat')}
          </p>
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t bg-background">
        <div className="container mx-auto px-4 py-4">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.placeholder')}
              disabled={isStreaming}
              className="flex-1"
              id="chat-input"
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming}
              className="gap-2 bg-gradient-to-r from-orange-500 to-emerald-600 hover:from-orange-600 hover:to-emerald-700 text-white"
              id="chat-send"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">{t('chat.send')}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
