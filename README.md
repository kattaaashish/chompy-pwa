# Chompy 🍎

A kids' meal-logging PWA. A child logs what they ate — by **photo** of the plate
or by **typing** — and Chompy identifies the foods, estimates nutrition, and shows
progress toward their daily needs. Built family-first: installable, no app store.

**Live:** https://chompy-pwa.ak-projects.workers.dev

This is the consolidated version — **one repo, one language (TypeScript), one
deploy**, entirely on Cloudflare. It replaces an earlier split of a Flutter app +
a Supabase backend.

---

## Stack

| Concern      | Tech |
|--------------|------|
| PWA frontend | Vite + React + TypeScript, `vite-plugin-pwa` (Workbox) |
| API / compute| Hono on Cloudflare **Workers** (`/api/*`) |
| Database     | Cloudflare **D1** (SQLite) + Drizzle ORM |
| File storage | Cloudflare **R2** (meal photos, private, per-user prefix) |
| Sessions     | Self-issued **JWT** (jose), 30-day |
| OTP          | Cloudflare **KV** (TTL'd challenges) |
| LLM          | **Anthropic Claude** — Haiku 4.5 (fast) + Opus 4.8 (vision/quality) |

One Worker serves both the built PWA (static assets via the `ASSETS` binding) and
the JSON API. No Supabase, no separate backend, no server to run.

---

## How the food-logging flow works

Both entry modes funnel into one pipeline: **extract → estimate → review → save**.

- **Photo** → the plate image is stored in R2, then Claude (Opus, vision) lists the
  dishes with rough quantities. The image is *also* fed into per-item nutrition
  estimation so portions are judged from pixels.
- **Type** → Claude (Haiku, fast) parses the free text ("2 roti, some dal") into
  items + quantities.
- Both then run per-item **nutrition estimation** (Opus) — calories, a canonical
  nutrient set, and a GO/GROW/GLOW **food group**.
- The user reviews/edits on a **review screen**, then saves. A saved meal can be
  reopened from Home and **edited** (quantities re-estimated on save).

LLM calls use **structured outputs** (JSON schema) so responses are always
parseable. `effort: low` is sent only to models that support it (Opus/Sonnet-4.6 —
**Haiku 4.5 400s on `effort`**).

---

## Layout

```
worker/                 Cloudflare Worker (Hono)
  index.ts              entry — mounts /api/* and serves static assets
  db/schema.ts          Drizzle schema (D1)
  db/client.ts          drizzle(env.DB)
  lib/                  env, auth (JWT), otp (KV), http, requirement
  routes/               auth, profile, meals, nutrition
shared/                 runtime-agnostic domain logic (LLM injected, no global env)
  llm.ts nutrition.ts requirements.ts validation.ts
src/                    React PWA — a state-machine SPA (no URL routing)
  store.tsx             onboarding + food-log state machine + actions
  api.ts                typed client over /api/* (with client-side retry)
  models.ts             food families, nutrient rows, aggregation
  screens/              welcome, phone, otp, profile, home, my food,
                        meal detail/edit, food/* (mode, type, review, …)
migrations/             D1 migrations (drizzle-kit generate)
```

---

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # set JWT_SECRET, OTP_PEPPER, ANTHROPIC_API_KEY, OTP_DEBUG=true
npm run db:migrate:local         # apply migrations to local D1 (Miniflare)
npm run build                    # build the PWA into dist/client
npm run dev:worker               # wrangler dev — serves PWA + API + local D1/R2/KV
```

Open http://localhost:8787. With `OTP_DEBUG=true`, any number signs in with the
dev master code **987654** (and `request-otp` echoes the real code).

For fast frontend iteration: `npm run dev` (Vite on 5173, proxies `/api` to
`wrangler dev` on 8787) alongside `npm run dev:worker`.

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server (frontend) |
| `npm run dev:worker` | `wrangler dev` (PWA + API + local bindings) |
| `npm run build` | Build the PWA to `dist/client` |
| `npm run deploy` | Build + `wrangler deploy` |
| `npm run typecheck` | Typecheck app + worker |
| `npm run db:generate` | Generate a D1 migration from the schema |
| `npm run db:migrate:local` / `:remote` | Apply migrations to local / hosted D1 |

---

## Deploy

Cloud resources already exist (D1 `chompy-db`, KV `OTP_KV`, R2
`chompy-meal-photos`) and their ids are in `wrangler.jsonc`. Secrets are set via
`wrangler secret put` (`ANTHROPIC_API_KEY`, `JWT_SECRET`, `OTP_PEPPER`).

```bash
npm run deploy
```

First-time setup on a new account:

```bash
wrangler d1 create chompy-db          # paste database_id into wrangler.jsonc
wrangler kv namespace create OTP_KV   # paste id into wrangler.jsonc
wrangler r2 bucket create chompy-meal-photos
npm run db:migrate:remote
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put JWT_SECRET
wrangler secret put OTP_PEPPER
```

---

## API (all POST unless noted)

| Endpoint | Purpose |
|---|---|
| `/api/auth/request-otp` | validate phone, store hashed OTP in KV (delivery stubbed) |
| `/api/auth/verify-otp` | verify code (or master OTP), create/reuse account, mint JWT |
| `/api/session-state` | resume stage from server truth (`phone`/`profile`/`home`) |
| `/api/profile` | save profile + first body measurement |
| `/api/meal/extract` | photo/text → items → per-item nutrition (review table) |
| `/api/nutrition/estimate` | re-estimate one item after an edit |
| `/api/meal/log` | save meal + items (+ raw `input` for MCP); idempotent via `clientToken` |
| `/api/meal/update` | edit a saved meal (owner-checked); recomputes totals |
| `/api/meal/fact` | one kid-friendly fun fact for a meal |
| `/api/nutrition/day` | a day's meals + totals + daily requirement (IST) |
| `/api/nutrition/week` | last 7 IST days + requirement |
| `GET /api/photo/*` | serve a meal photo (owner-only) |
| `GET /api/health` | health check |
| `/mcp`, `/oauth/*`, `/.well-known/oauth-*` | read-only MCP server + its OAuth login (see below) |

Error envelope: `{ error: { code, message, fieldErrors?, retryable? } }`.

---

## MCP server (read-only) — use your data from Claude / ChatGPT / any harness

The Worker also exposes a **read-only [MCP](https://modelcontextprotocol.io) server**
at **`/mcp`** (Streamable HTTP, stateless JSON). It surfaces everything the app
stores for the signed-in account — nothing else, and no tool can write.

**Connect** by adding `https://chompy-pwa.ak-projects.workers.dev/mcp` as a custom
connector / remote MCP server. The client discovers OAuth automatically, opens a
tiny login page in the browser (phone number + OTP — the same `123456` master
code as the app), and receives a token that is scoped to **`aud: "mcp"`**, so even
if a harness leaks it, it can only read via `/mcp` and is rejected by `/api/*`.

| Client | How |
|---|---|
| Claude.ai / Claude Desktop | Settings → Connectors → *Add custom connector* → paste the `/mcp` URL |
| ChatGPT | Settings → Connectors (Developer mode) → *Create* → paste the `/mcp` URL. `search` + `fetch` tools are included for ChatGPT's connector contract |
| Claude Code | `claude mcp add --transport http chompy https://chompy-pwa.ak-projects.workers.dev/mcp` (then `/mcp` → authenticate) |
| Anything with a bearer header | Sign in via `POST /api/auth/verify-otp` and send `Authorization: Bearer <access_token>` — app tokens are accepted by `/mcp` too |

**Tools**

| Tool | Returns |
|---|---|
| `get_profile` | child profile, height/weight history, personalised daily requirement (ICMR-NIN) |
| `list_meals` | meals in an IST date range (default last 7 days) with items, nutrition, totals and **raw input** |
| `get_meal` | one meal in full |
| `get_meal_photo` | the plate photo as an image block (photo-logged meals) |
| `get_nutrition_summary` | day-by-day totals + % of requirement, food-group / GO-GROW-GLOW breakdown, averages |
| `get_recommendations` | the evening dinner suggestions per day |
| `get_reference` | nutrient keys/units, food groups, and how Chompy calculates |
| `search` / `fetch` | ChatGPT-style search over meals by food, text or date; fetch a meal document |

Per meal, `input` carries **what was entered** — `mode` (`text`/`photo`), the typed
`text`, `has_photo` — and **what Chompy first made of it**: `extracted_items`, the
review table exactly as the LLM produced it before the child edited it. `items`
are the confirmed, saved rows. Meals saved before this existed have `mode: null`.

Endpoints behind the scenes: `/.well-known/oauth-protected-resource[/mcp]`,
`/.well-known/oauth-authorization-server`, `/oauth/register` (dynamic client
registration), `/oauth/authorize` (login page), `/oauth/token` (PKCE S256 required,
refresh tokens rotate). Codes/clients/refresh tokens live in `OTP_KV`. Code:
`worker/mcp/` (`oauth.ts`, `server.ts`, `index.ts`).

Quick local check:

```bash
TOK=$(curl -s localhost:8787/api/auth/verify-otp -H 'content-type: application/json' \
  -d '{"phone":"9876543210","code":"123456"}' | jq -r .session.access_token)
curl -s localhost:8787/mcp -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
```

---

## Login (important)

Real SMS delivery is **not wired** — the OTP code is only logged, not sent. So a
**master OTP** (`MASTER_OTP` var in `wrangler.jsonc`, currently `123456`) lets the
family sign in: entering it verifies **any** phone number. It's a shared password —
anyone with it + the URL can sign in as any number — acceptable for an unlisted
family app. Remove the var (or wire real SMS in `worker/routes/auth.ts`
`request-otp`) to disable it.

> Because `MASTER_OTP` sits in `wrangler.jsonc`, **keep this repo private**, or move
> the value to a `wrangler secret`.

---

## Known gotchas

- **Workers → Anthropic egress occasionally returns `403 "Request not allowed"`**
  (abuse protection on shared Worker egress IPs; direct calls are reliable). It's
  correlated within a single invocation, so it's handled with: in-Worker retry +
  backoff, a Haiku→Opus model fallback, and a **client-side retry on a fresh
  request** (new isolate/IP) — see `shared/llm.ts` and `src/api.ts`. The durable
  fix is routing through **Cloudflare AI Gateway** (not yet set up).
- **Nutrition is Claude-estimated**, not grounded in a food database — approximate
  by design.
- **Days bucket in IST** (`istDayRange` / `istDayKey` in `shared/nutrition.ts`).
