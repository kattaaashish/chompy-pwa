# Chompy PWA — single project on Cloudflare

Chompy is a kids' meal-logging app. This is the **consolidated** version: one repo,
one language (TypeScript), one deploy — the whole thing runs on Cloudflare. It
replaces the old two-project setup (`chompy-app` Flutter + `chompy-backend`
Supabase).

## Stack

| Concern      | Tech |
|--------------|------|
| PWA frontend | Vite + React + TypeScript, `vite-plugin-pwa` (Workbox) |
| API/compute  | Hono on Cloudflare Workers (`/api/*`) |
| Database     | Cloudflare **D1** (SQLite) + Drizzle ORM |
| File storage | Cloudflare **R2** (meal photos, private, per-user prefix) |
| Sessions     | JWT (jose) signed with a Worker secret |
| OTP          | Cloudflare **KV** (TTL'd challenges) |
| LLM          | Anthropic Claude via `fetch` (food extraction + nutrition) |

One Worker serves both the built PWA (static assets, via the `ASSETS` binding)
and the API. No Supabase, no separate backend.

## Layout

```
worker/            Cloudflare Worker (Hono)
  index.ts         entry — mounts /api/* and serves static assets
  db/schema.ts     Drizzle schema (D1)
  db/client.ts     drizzle(env.DB)
  lib/             env, auth (JWT), otp (KV), http, requirement
  routes/          auth, profile, meals, nutrition
shared/            runtime-agnostic domain logic (LLM injected)
  llm.ts nutrition.ts requirements.ts validation.ts
src/               React PWA (state-machine SPA, no URL routing)
  screens/         welcome, phone, otp, profile, home, my food, food/*
migrations/        D1 migrations (drizzle-kit generate)
```

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars          # set JWT_SECRET, OTP_PEPPER, ANTHROPIC_API_KEY, OTP_DEBUG=true
npm run db:migrate:local                # apply migrations to local D1 (Miniflare)
npm run build                           # build the PWA into dist/client
npm run dev:worker                      # wrangler dev — serves PWA + API + local D1/R2/KV
```

Open http://localhost:8787. With `OTP_DEBUG=true`, any number signs in with the
master code **987654** (and `request-otp` echoes the real code too).

For fast frontend iteration, run `npm run dev` (Vite on 5173, proxies `/api` to
`wrangler dev` on 8787) in a second terminal alongside `npm run dev:worker`.

## First-time cloud setup

```bash
wrangler d1 create chompy-db            # paste database_id into wrangler.jsonc
wrangler kv namespace create OTP_KV     # paste id into wrangler.jsonc
wrangler r2 bucket create chompy-meal-photos
npm run db:migrate:remote               # migrations -> hosted D1
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put JWT_SECRET
wrangler secret put OTP_PEPPER
```

## Deploy

```bash
npm run deploy    # vite build + wrangler deploy (one Worker)
```

Production keeps `OTP_DEBUG` unset/false (the master code + code echo are dev-only).
Real SMS delivery is still stubbed — the code is only logged (see `worker/lib/otp.ts`).

## API (all POST unless noted)

`/api/auth/request-otp` · `/api/auth/verify-otp` · `/api/session-state` ·
`/api/profile` · `/api/meal/extract` · `/api/nutrition/estimate` ·
`/api/meal/log` · `/api/meal/fact` · `/api/nutrition/day` ·
`/api/nutrition/week` · `GET /api/photo/*` (owner-only) · `GET /api/health`

Error envelope: `{ error: { code, message, fieldErrors?, retryable? } }`.
