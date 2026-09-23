# Chompy 🍎

**Snap their meals. Know their nutrition.**

Chompy is a kids' meal-logging app that turns a quick photo of a plate — or a few
typed words — into a clear picture of what your child actually ate and how it
stacks up against their daily nutritional needs. No food diaries, no calorie
math, no guesswork. Just snap, review, and see how the day is shaping up.

**Live app:** https://chompy-pwa.ak-projects.workers.dev

---

## 🎬 See Chompy in action

▶️ **[Watch the 30-second intro](https://pub-c2be4fe9018b485684e4a9b5c17afdc3.r2.dev/chompy-ad.mp4)** — hosted on Cloudflare R2.

<video src="https://pub-c2be4fe9018b485684e4a9b5c17afdc3.r2.dev/chompy-ad.mp4" controls width="360"></video>

> If the player above doesn't load in your Markdown viewer, use the link.

---

## What Chompy is

A family-first, installable web app (PWA) — nothing to download from an app store.
A child (or parent) logs a meal, and Chompy's AI recognizes the foods, estimates
the nutrition, and tracks it against a personalized daily target based on the
child's age and growth. It's built to make healthy eating **visible and
encouraging**, not clinical.

## What Chompy can do

- **📸 Log by photo** — snap the plate and Chompy identifies the dishes and judges
  portions from the image.
- **⌨️ Log by typing** — "2 rotis, some dal, a banana" works just as well.
- **🥗 Estimate nutrition** — calories plus a full nutrient breakdown for every
  item, with each food sorted into friendly **GO / GROW / GLOW** groups.
- **📊 Track the day** — see meals, totals, and progress toward a personalized
  daily requirement (based on ICMR-NIN guidance for the child's age).
- **📅 See the week** — a rolling 7-day view of how nutrition trends over time.
- **✏️ Review & edit** — confirm or tweak what was detected before saving; reopen
  and edit any saved meal later.
- **💡 Get dinner ideas** — a daily suggestion for what to add at dinner to fill
  the gaps in the day.
- **🔔 Gentle reminders** — optional push notifications so meals don't get missed.
- **🤖 Ask from ChatGPT or Claude** — connect Chompy as a read-only assistant tool
  (see below) and just *ask* how the day is going.

## How to use Chompy

1. **Install it.** On iPhone, open the app URL in **Safari**, tap **Share → Add to
   Home Screen**. On Android, open in Chrome and tap **Install app**. It runs
   full-screen like a native app.
2. **Sign in** with your phone number and the one-time code.
3. **Set up the child's profile** once (name, age, a height/weight) so nutrition
   targets are personalized.
4. **Log a meal** — tap to add, then choose **photo** or **type**.
5. **Review** what Chompy detected, adjust if needed, and **save**.
6. **Track** the day and week from the home screen, and check the **dinner idea**
   in the evening.

---

## 🤖 Use Chompy from ChatGPT (and Claude)

Chompy exposes a **read-only assistant integration** (an [MCP](https://modelcontextprotocol.io)
server) so you can ask an AI assistant about your child's eating without opening
the app. It can **read** the log; it can never change anything.

**Connect it:**

| Client | How |
|---|---|
| **ChatGPT** | Settings → **Connectors** (custom connector / developer mode) → add `https://chompy-pwa.ak-projects.workers.dev/mcp` |
| **Claude.ai / Claude Desktop** | Settings → **Connectors** → *Add custom connector* → paste the same `/mcp` URL |
| **Claude Code** | `claude mcp add --transport http chompy https://chompy-pwa.ak-projects.workers.dev/mcp` |

On first connect, your assistant opens a short **sign-in page** in the browser
(your phone number + one-time code) and you **authorize** access. After that you
can ask things like *"What did my child eat today?"*, *"Which nutrients are low
this week?"*, or *"What should I add at dinner?"* and get answers grounded in the
real log.

**What the assistant can read:** the child's profile and daily target, meals with
their items and nutrition, meal photos, day/week nutrition summaries, dinner
recommendations, and reference info on how Chompy calculates. **There are no
write tools** — an assistant can look, but never log or edit.

---

## 🛠️ Tech stack

**One repository, one language (TypeScript), one deploy — entirely on Cloudflare.**

### The app

| Concern | Tech |
|---|---|
| PWA frontend | Vite + React + TypeScript, `vite-plugin-pwa` (Workbox) |
| API / compute | [Hono](https://hono.dev) on Cloudflare **Workers** |
| Database | Cloudflare **D1** (SQLite) + Drizzle ORM |
| File storage | Cloudflare **R2** (meal photos, private, per-user) |
| Sessions | Self-issued **JWT** (jose) |
| One-time codes | Cloudflare **KV** (TTL'd) |
| AI | **Anthropic Claude** — Haiku 4.5 (fast text) + Opus 4.8 (vision & quality) |
| Assistant access | **MCP** server + OAuth 2.1, served by the same Worker |

A single Worker serves the built PWA (static assets), the JSON API, **and** the
MCP server. No separate backend, no server to run.

### The marketing video

The 30-second ad is generated **entirely in code** and rendered as an MP4:

| Concern | Tech |
|---|---|
| Video engine | [**Remotion**](https://remotion.dev) — the ad is a React composition (1080×1920, 30 fps) |
| Real app footage | **Playwright** captures live screenshots of the app; scenes animate crops of them so the UI is pixel-accurate |
| Voiceover | **ElevenLabs** text-to-speech (v3), one clip per scene, generated via a script |
| Background music | An **instrumental track** (ElevenLabs Music), converted and mixed under the voiceover with fade in/out inside Remotion |
| Hosting | Rendered MP4 uploaded to a public **Cloudflare R2** bucket |

Lives in [`marketing/video/`](marketing/video/); generation scripts in
[`scripts/`](scripts/).

---

## 💻 Run it locally

### The app

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in your own JWT_SECRET, OTP_PEPPER, ANTHROPIC_API_KEY
npm run db:migrate:local         # apply migrations to local D1 (Miniflare)
npm run build                    # build the PWA into dist/client
npm run dev:worker               # wrangler dev — serves PWA + API + local D1/R2/KV
```

Open http://localhost:8787. For fast frontend iteration, run `npm run dev` (Vite
on :5173, proxies `/api` to the worker) alongside `npm run dev:worker`.

Common scripts:

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server (frontend) |
| `npm run dev:worker` | `wrangler dev` (PWA + API + local bindings) |
| `npm run build` | Build the PWA to `dist/client` |
| `npm run deploy` | Build + `wrangler deploy` |
| `npm run typecheck` | Typecheck app + worker |
| `npm run db:generate` | Generate a D1 migration from the schema |
| `npm run db:migrate:local` / `:remote` | Apply migrations to local / hosted D1 |

You'll need your own Cloudflare account (for D1 / KV / R2) and an Anthropic API
key. Create the resources with `wrangler d1 create`, `wrangler kv namespace
create`, and `wrangler r2 bucket create`, then set app secrets with `wrangler
secret put`.

### The marketing video

```bash
cd marketing/video
npm install
npm run studio      # live preview / scrub the timeline in Remotion Studio
npm run render      # render the MP4 to out/chompy-ad.mp4
```

To (re)generate the audio, put your ElevenLabs credentials in a `.env` at the repo
root (`ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`) and run:

```bash
node --env-file=.env scripts/generate-voice.mjs   # voiceover clips
node --env-file=.env scripts/generate-music.mjs   # background music bed
```

Audio files land in `marketing/video/public/audio/` and are picked up
automatically on the next render. To re-capture the in-app screenshots, see the
tools in `marketing/video/tools/`.

---

## Notes

- **Nutrition is AI-estimated**, not grounded in a food database — it's meant as a
  helpful approximation, not medical advice.
- Days are bucketed in **IST**.
- This project consolidates an earlier Flutter app + Supabase backend into a
  single all-TypeScript, all-Cloudflare codebase.
