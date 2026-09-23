# CLAUDE.md — Chompy PWA

Orientation for an agent picking up this project. Keep it lean; update it when the
architecture changes.

## What this is
Chompy — a kids' meal-logging PWA. Child logs food (photo/type) → Claude extracts
items + estimates nutrition → review/save → progress vs daily needs. One repo,
all-TypeScript, entirely on Cloudflare. Supersedes an old Flutter app + Supabase
backend (both deleted).

## Status (keep current)
- **Deployed & live:** https://chompy-pwa.ak-projects.workers.dev
- **Cloud account:** `69760889727120af14aa07df121aedf6` (aashish.iitr@gmail.com)
- **Resources:** D1 `chompy-db` (`2899bdd6-b3b0-4339-bc4d-61e0875f4e1e`), KV
  `OTP_KV` (`15ad0a213b024e448e973e2bb1264e52`), R2 `chompy-meal-photos`. Ids are
  in `wrangler.jsonc`.
- **Secrets set** (via `wrangler secret put`): `ANTHROPIC_API_KEY`, `JWT_SECRET`,
  `OTP_PEPPER`.
- **GitHub:** https://github.com/kattaaashish/chompy-pwa (personal account; the
  remote uses SSH host `github-personal`).

## Architecture
One Worker (`worker/index.ts`, Hono) serves the built PWA via the `ASSETS` binding,
the `/api/*` JSON API, **and a read-only MCP server** (`/mcp` + OAuth, see below).
`app.all("*")` falls back to `ASSETS.fetch` (SPA).
The frontend is a **state-machine SPA with no URL routing** — navigation is state
in `src/store.tsx`, mirroring the old Flutter `_Root`.

## Where things live
- **Domain logic → `shared/`** (runtime-agnostic; the LLM client is *injected*,
  no global env):
  - `nutrition.ts` — extraction/estimation (LLM), `sumNutrition`, IST day
    bucketing (`istDayRange`/`istDayKey`), `validateItem`, food groups, prompts.
  - `requirements.ts` — ICMR-NIN RDA → personalized daily target (`dailyRequirement`).
  - `validation.ts` — profile/phone/OTP validation.
  - `llm.ts` — Claude client: `createLlm(apiKey, model)`, retries, `effort` gating.
- **Worker glue → `worker/lib/`** (`env`, `auth` JWT, `otp` KV, `login` = shared
  phone+OTP login, `http`, `requirement`) and **`worker/routes/`** (`auth`,
  `profile`, `meals`, `nutrition`). DB in `worker/db/` (Drizzle schema + client).
- **MCP server → `worker/mcp/`**: `oauth.ts` (OAuth 2.1 AS: metadata, dynamic
  registration, phone+OTP login page, PKCE token endpoint; state in `OTP_KV`),
  `server.ts` (the read-only tools, built per request), `index.ts` (`/mcp` route).
- **Frontend → `src/`**: `store.tsx` (state machine + actions), `api.ts` (typed
  client + client retry), `models.ts` (families, nutrient rows, `aggregateItems`),
  `screens/` (incl. `MealDetail.tsx` = view/edit a saved meal, `MyFood.tsx`,
  `Home.tsx` = category-grouped "Meals today").

## LLM model routing (important)
- **Logging (`/meal/extract`) → one Opus 4.8 call** (`CHOMPY_LLM_MODEL`): a single
  `extractAndEstimate()` (`shared/nutrition.ts`) returns the whole review table —
  items **and** per-item nutrition — in one round-trip. Replaces the old
  extract-then-estimate-per-item fan-out (was Haiku extract + N Opus estimates).
  On photos the plate image is sent **once** (not once per item); the model reads
  every portion from that one image.
- **Fun fact → Haiku 4.5** (`CHOMPY_LLM_MODEL_FAST`, low latency, no vision).
- **Edit re-estimate (`/nutrition/estimate`) → single-item Opus** (`estimateNutrition`).
  If the client passes the meal's `photoPath`, the route loads it from R2
  (owner-checked) and threads it in, so an edited item is re-portioned from the
  same plate image instead of text-only.
- **`effort` 400s on Haiku 4.5** — `shared/llm.ts` gates it to Opus/Sonnet-4.6.
  If you add a model, update `supportsEffort()`.
- Combined prompt = shared extraction base + modality hint (text: trust stated
  quantities; image: estimate portions, don't invent hidden foods) + the estimation
  instructions (calories/food_group/nutrient set).

## Resilience — the Workers→Anthropic 403
The Worker's fetch egress intermittently draws `403 "Request not allowed"`
(abuse protection on shared IPs; direct calls are 100% reliable). It's **correlated
within one invocation**, so it's mitigated in three layers:
1. `shared/llm.ts` — retry transient 403/429/5xx with backoff.
2. `worker/routes/meals.ts` — the fun-fact call falls back Haiku→Opus. (Logging is
   now a single Opus call, so there's no per-stage fallback there anymore.)
3. `src/api.ts` — **client-side retry on a fresh request** (new isolate/IP) for the
   LLM-backed calls — this is the effective fix (in-invocation retries share the
   flagged IP).
**Durable fix (not done): route Anthropic calls through Cloudflare AI Gateway.**
Blocked earlier because the wrangler OAuth token isn't accepted by the AI-Gateway
REST API — needs a real CF API token or a dashboard-created gateway, then change
the URL in `shared/llm.ts`.

## Porting notes (vs the old Supabase backend)
- Postgres→D1: uuid→text (`crypto.randomUUID()`), timestamptz→ISO text (IST logic
  works on ISO strings unchanged), jsonb→text `{mode:"json"}`, numeric→real.
- **RLS is gone** — every query filters by `userId` (from JWT `sub`, set by
  `requireAuth`). Don't forget the `where(eq(..profileId, userId))`.
- Auth: Supabase Auth → self-issued JWT (`worker/lib/auth.ts`).
- OTP: `otp_challenges` table → KV `otp:<phone>` with `expirationTtl` (so expired
  == absent; expired/wrong both return `code_invalid`).
- Storage: → R2, served owner-only via `GET /api/photo/*` (enforces `${userId}/…`).
- Error envelope + nutrition shapes unchanged, so the UI contract is identical.

## Conventions
- Nutrition shape: `calories:number` + `nutrients:[{nutrient_type,value,unit}]`,
  enum-constrained to `NUTRIENT_SET`; each item gets a `food_group` (13 GO/GROW/GLOW
  families + `other`). Day totals reuse `sumNutrition`.
- Meal save is idempotent via `clientToken` (unique index; the store keeps the key
  in a ref so retries reuse it).
- Editing a saved meal: `POST /api/meal/update` (owner-checked) replaces the item
  set + recomputes cached totals. The client re-estimates edited items via
  `/nutrition/estimate` before saving, passing the meal's `photoPath` so photo
  meals keep image-based portioning on edits.
- Home "Meals today" groups meals by category and shows a summary
  (`aggregateItems` in `models.ts`), expandable to items; edit is per underlying
  meal id.

## MCP server (read-only)
- `/mcp` = stateless Streamable HTTP (JSON responses; GET/DELETE → 405). Uses
  `@modelcontextprotocol/sdk` `WebStandardStreamableHTTPServerTransport` + `zod`.
- Tools: `get_profile`, `list_meals`, `get_meal`, `get_meal_photo` (image block),
  `get_nutrition_summary`, `get_recommendations`, `get_reference`, plus ChatGPT's
  `search`/`fetch`. **No write tools — keep it that way.**
- **Token audiences**: OAuth-minted tokens carry `aud:"mcp"`; `requireAuth` (the
  app API) rejects them, `/mcp` accepts both app and mcp tokens. Don't loosen this.
- **Raw input**: `meals.input_mode/input_text/extracted_items` (migration 0004)
  are written by `/meal/log` from the client's `input` field (store keeps
  `rawInput` from extract → save). Best-effort; never blocks a save. Older meals
  have nulls.
- Login page reuses `worker/lib/login.ts` (same master OTP rules as the app).
- **Security caveat (accepted in dev, MUST fix before real users):** `/mcp` +
  OAuth is a *public, auto-discoverable* surface, and `/oauth/register` is open.
  Combined with `MASTER_OTP` (`123456`) verifying ANY phone, anyone on the
  internet can currently mint a read token for a family's whole log + photos.
  Also: MCP access tokens are 30 days with no revocation endpoint. Before going
  live: wire real SMS (retire the master OTP on the OAuth path), rate-limit
  `/oauth/authorize`, and shorten/allow revocation of `aud:"mcp"` tokens.

## Auth / login
- Real SMS is **stubbed** — code only logged. **`MASTER_OTP` var (`123456`)**
  verifies ANY phone in any environment → the family's login. Shared password; keep
  the repo private or move it to a `wrangler secret`. Implemented in
  `worker/lib/otp.ts` (`isMasterOtp`) + `routes/auth.ts`.
- Dev also has `OTP_DEBUG=true` → dev master `987654` + code echo. Prod
  `OTP_DEBUG=false`.

## Run / deploy
Local: `npm i && cp .dev.vars.example .dev.vars && npm run db:migrate:local &&
npm run build && npm run dev:worker` → http://localhost:8787.
Deploy: `npm run deploy`. Typecheck: `npm run typecheck`.

## Pending / not built
- **Real SMS** (wire a provider in `request-otp`; then retire `MASTER_OTP`).
- **AI Gateway** for durable LLM egress reliability (see Resilience).
- Deleting the old GitHub repos `kattaaashish/chompy-app` + `chompy-backend`
  (needs `gh auth login` with `delete_repo`; local copies already removed).
- Deleting/removing individual saved meals (only edit exists; no delete endpoint).
- Parent/child role split (single account type today).
- Automated tests (none). Verify manually via `wrangler dev` + curl, or the live URL.
- MCP: rate-limiting the `/oauth/authorize` login form; photo downscaling for
  `get_meal_photo` (photos > 5 MB are described, not returned).

## Gotchas
- Don't send `effort` to Haiku — it 400s. `shared/llm.ts` handles it; keep it that way.
- Nutrition is LLM-estimated, not from a food DB — approximate by design.
- `nutrition-week` meals have no `id` (week view doesn't edit); only `nutrition-day`
  meals carry an id for editing.
- The frontend has **no secrets**; auth is a JWT in `localStorage`.
