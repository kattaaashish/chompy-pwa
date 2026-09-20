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
| `/api/meal/log` | save meal + items; idempotent via `clientToken` |
| `/api/meal/update` | edit a saved meal (owner-checked); recomputes totals |
| `/api/meal/fact` | one kid-friendly fun fact for a meal |
| `/api/nutrition/day` | a day's meals + totals + daily requirement (IST) |
| `/api/nutrition/week` | last 7 IST days + requirement |
| `GET /api/photo/*` | serve a meal photo (owner-only) |
| `GET /api/health` | health check |

Error envelope: `{ error: { code, message, fieldErrors?, retryable? } }`.

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
