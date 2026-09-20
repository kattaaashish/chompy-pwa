# CLAUDE.md — Chompy PWA (Cloudflare)

Orientation for future sessions. Keep it lean.

## What this is
The consolidated Chompy: one repo, all on Cloudflare. Kids' meal-logging app —
child logs food (photo/type), sees progress; parent sets up the profile. Replaces
the old `chompy-app` (Flutter) + `chompy-backend` (Supabase) split, which this
project supersedes and which can be archived.

## Stack (see README)
Vite+React PWA · Hono Worker · D1 (Drizzle) · R2 (photos) · KV (OTP) · JWT auth ·
Claude for extraction/estimation. One Worker serves the PWA (ASSETS binding) and
`/api/*`. `worker/index.ts` is the entry.

## Where things live
- **Domain logic** is in `shared/` (runtime-agnostic; the LLM client is *injected*
  via `createLlm(apiKey, model)` — no global env). `nutrition.ts` (extraction,
  estimation, sumNutrition, IST day bucketing, validation), `requirements.ts`
  (ICMR-NIN RDA → personalized daily target), `validation.ts` (profile/phone/OTP).
- **Worker glue** in `worker/lib/` (env, auth, otp, http, requirement) and
  `worker/routes/` (auth, profile, meals, nutrition). `worker/db/` holds the
  Drizzle schema + client.
- **Frontend** in `src/` — a state-machine SPA (no URL routing), mirroring the old
  Flutter `_Root`: `store.tsx` is the onboarding + food-log state machine; screens
  under `src/screens/`.

## Porting notes (vs the old Supabase backend)
- Postgres→D1: `uuid`→text (crypto.randomUUID), `timestamptz`→ISO text (IST logic
  works on ISO strings unchanged), `jsonb`→text `{mode:"json"}`, `numeric`→real.
- **RLS is gone** — every query filters by `userId` in the Worker (`requireAuth`
  sets it from the JWT `sub`). Don't forget the `where(eq(..profileId, userId))`.
- **Auth**: Supabase Auth → self-issued JWT (30-day, HS256, `worker/lib/auth.ts`).
- **OTP**: `otp_challenges` table → KV key `otp:<phone>` with `expirationTtl`.
  Expired = simply absent, so we can't distinguish expired vs wrong (both →
  `code_invalid`); the app's "expired" copy only shows on an explicit `code_expired`.
- **Photos**: Supabase Storage → R2. Served via `GET /api/photo/*`, which enforces
  the `${userId}/...` prefix (owner-only).
- Error envelope + nutrition shapes are unchanged, so the contract the UI branches
  on is identical.

## Conventions
- Nutrition shape: `calories:number` + `nutrients:[{nutrient_type,value,unit}]`.
  Per-item estimation is enum-constrained to `NUTRIENT_SET`; each item gets a
  `food_group` (13 GO/GROW/GLOW families + `other`). Day totals reuse `sumNutrition`.
- Days bucket in **IST** (`istDayRange`/`istDayKey`).
- Meal save is idempotent via `clientToken` (unique index; the store keeps the key
  in a ref so retries reuse it).
- `OTP_DEBUG=true` (dev only): master code `987654` verifies any number and the
  real code is echoed. Never set in production.

## Run / deploy
See README. Local: `npm i && npm run db:migrate:local && npm run build && npm run
dev:worker` → http://localhost:8787. Deploy: `npm run deploy`.

## Not built / pending
- Real SMS (OTP stubbed to console/logs).
- Editing/deleting saved meals.
- Parent/child role split (single account type).
- Cloud resource IDs in `wrangler.jsonc` are placeholders — fill after
  `wrangler d1 create` / `kv namespace create` before first deploy.
- Automated tests (none yet). Verified manually via curl against `wrangler dev`.
