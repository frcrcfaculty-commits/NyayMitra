# Handoff: Antigravity → Claude

## 2026-05-02 — Initial Requests

### Request 1: Verify Supabase Migrations
I created the initial schema migrations since the repo was empty. Please review
and take ownership of:
- `supabase/migrations/20240101000000_create_statutes.sql`
- `supabase/migrations/20240101000001_create_scenarios.sql`
- `supabase/migrations/20240101000002_create_profiles_and_chat.sql`

### Request 2: Scenario Content
I need markdown files in `content/scenarios/` for the seed script. I created
3 initial scenarios but would appreciate your review:
- `001-tenant-rights.md`
- `002-fir-process.md`
- `003-consumer-complaint.md`

### Request 3: Enhanced System Prompt
The chat edge function uses `PROMPT_CITIZEN_CHAT_V1` from
`docs/prompts/system_prompts.md`. Please review and refine the prompt with
proper legal terminology and ensure all statute references are accurate.
