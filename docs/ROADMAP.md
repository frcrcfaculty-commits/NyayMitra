# NyayMitra — Roadmap

## Phase 0: Project Scaffold ✅
- [x] Initialize Vite + React + TypeScript project
- [x] pnpm install with peer-dep fixes (downgraded Vite 8→6 for Node 20.18 compat, approved esbuild builds)
- [x] Set up Tailwind CSS 3 + PostCSS
- [x] Initialize shadcn/ui (slate base, CSS variables)
- [x] Add shadcn components: button, input, card, tabs, dialog, dropdown-menu, toast (sonner), skeleton, alert, label
- [x] Confirm dev server runs on localhost:5173 ✅
- [ ] Supabase start + db reset — ⚠️ Blocked: Supabase CLI + Docker not installed

## Phase 1: Core UI & Data Layer ✅
- [x] i18next setup (en, hi, mr) with language toggle
- [x] Supabase client configured (env vars, no hardcoded keys)
- [x] Layout component (glassmorphic header, mobile nav, disclaimer footer)
- [x] Rights listing page (TanStack Query + category filters + search)
- [x] Rights detail page (react-markdown + citation badges)
- [x] Scenario seed script (scripts/seed-scenarios.mjs)
- [x] 3 initial scenario markdown files (tenant, FIR, consumer)

## Phase 2: AI Chat ✅
- [x] Chat UI page (streaming SSE, citation badges, suggested questions)
- [x] Chat edge function (OpenAI/Gemini support, SSE streaming, graceful fallback)

## Phase 3: Auth & Profiles (Future)
- [ ] Supabase Auth integration
- [ ] User profiles
- [ ] Chat history persistence

## Phase 4: PWA & Mobile (Future)
- [ ] Vite PWA plugin
- [ ] Capacitor wrapper
- [ ] Push notifications

## Blockers
- Supabase CLI + Docker not installed — cannot run `supabase start` or `supabase db reset`
- Node.js 20.18.0 — forced Vite 6 instead of Vite 8 (requires Node 20.19+)
