# Deploying NyayMitra to Vercel

## Prerequisites

- A [Vercel](https://vercel.com) account
- The NyayMitra GitHub repository connected to Vercel
- A Supabase project with all migrations applied

## Steps

### 1. Create a Vercel project

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the `frcrcfaculty-commits/NyayMitra` GitHub repository
3. Configure the project settings:
   - **Framework Preset:** Vite
   - **Build Command:** `pnpm build`
   - **Output Directory:** `dist`
   - **Install Command:** `pnpm install --frozen-lockfile`

### 2. Configure environment variables

In your Vercel project settings → Environment Variables, add:

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Your Supabase project URL (e.g. `https://xyz.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Yes | Your Supabase anon/public key |
| `VITE_SUPABASE_FUNCTIONS_URL` | Yes | Edge functions URL (e.g. `https://xyz.supabase.co/functions/v1`) |
| `VITE_SENTRY_DSN` | Prod only | Sentry DSN for error tracking |
| `VITE_PLAUSIBLE_DOMAIN` | Optional | Domain for Plausible analytics |

See `.env.example` in the repo root for the full list.

### 3. Deploy

- **Production:** push to `main` → auto-deploys to production
- **Preview:** every PR gets a preview deployment URL
- Enable "PR preview deployments" in Vercel project settings if not already on

### 4. Verify

After deployment:
1. Visit the production URL
2. Confirm the home page loads
3. Navigate to `/rights` and verify scenarios render
4. Navigate to `/law` and verify the statutes index loads
5. Open DevTools → Application → confirm the PWA manifest validates and the service worker registers
6. Check `/chat` loads (it won't return AI responses without edge function secrets configured in Supabase)

## Edge Function Secrets (Supabase side)

The chat edge function needs these secrets set in your Supabase project dashboard under Settings → Edge Functions:

| Secret | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key for Tier 1 routing |
| `ANTHROPIC_API_KEY` | Anthropic API key for Tier 2 routing |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for DB queries from the edge function |

These are NOT Vercel env vars — they are configured in Supabase directly.
