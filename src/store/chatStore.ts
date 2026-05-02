import { create } from 'zustand'

export interface Citation {
  act: string
  section: string
  verified: boolean
  url?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  timestamp: Date
}

interface ChatState {
  messages: Message[]
  input: string
  isStreaming: boolean
  setInput: (input: string) => void
  setIsStreaming: (isStreaming: boolean) => void
  addMessage: (message: Message) => void
  updateAssistantMessage: (id: string, content: string, citations?: Citation[]) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  input: '',
  isStreaming: false,
  setInput: (input) => set({ input }),
  setIsStreaming: (isStreaming) => set({ isStreaming }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateAssistantMessage: (id, content, citations) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, content, ...(citations ? { citations } : {}) } : m
      ),
    })),
  clearMessages: () => set({ messages: [] }),
}))
