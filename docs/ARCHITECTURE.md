# NyayMitra — Architecture

## Overview
NyayMitra is an AI-powered legal awareness platform for Indian citizens.
It helps users understand their rights in common situations (tenant disputes,
workplace harassment, consumer complaints, etc.) by referencing actual Indian
statutes and providing AI-guided chat assistance.

## Tech Stack

### Frontend
- **Framework**: React 19 + TypeScript + Vite 8
- **Styling**: Tailwind CSS 3 + shadcn/ui (slate)
- **Routing**: React Router v7
- **Server state**: TanStack Query v5
- **Client state**: Zustand v5
- **i18n**: i18next + react-i18next (en, hi, mr)
- **Markdown**: react-markdown + remark-gfm

### Backend
- **Database**: Supabase (PostgreSQL 15 + RLS)
- **Auth**: Supabase Auth (email + phone OTP)
- **Edge Functions**: Deno (Supabase Functions)
- **AI**: OpenAI / Gemini via edge function proxy

### Mobile
- **PWA**: Vite PWA plugin (planned)
- **Native wrapper**: Capacitor (future)

## Database Schema

### Core Tables
- `statutes` — Indian legal statutes (IPC, CrPC, BNS, etc.)
- `scenarios` — "Know Your Rights" scenario content
- `profiles` — User profiles (extends Supabase auth.users)
- `chat_sessions` — Chat conversation history

### Row Level Security
All tables have RLS enabled. Anonymous read access for scenarios and statutes.
Authenticated access required for chat sessions and profiles.

## Project Structure
```
├── docs/                    # Documentation (Claude-owned)
│   ├── ARCHITECTURE.md
│   ├── ROADMAP.md
│   ├── COMPLIANCE.md
│   └── prompts/
├── content/                 # Legal content (Claude-owned)
│   └── scenarios/
├── src/                     # Frontend (Antigravity-owned)
│   ├── components/
│   │   ├── ui/              # shadcn/ui primitives
│   │   └── Layout.tsx
│   ├── pages/
│   ├── lib/
│   ├── hooks/
│   ├── i18n/
│   └── stores/
├── supabase/
│   ├── migrations/          # Schema (Claude-owned)
│   └── functions/           # Edge functions (Antigravity-owned)
└── scripts/                 # Build/seed scripts
```

## Design Principles
1. **Mobile-first**: 375px minimum viewport. Most users are on phones.
2. **Multilingual**: Hindi and Marathi alongside English.
3. **Legal disclaimer on every screen**: We are NOT lawyers.
4. **No hardcoded API keys**: Everything via env vars.
5. **Verified citations only**: Warning badges for unverified sources.
