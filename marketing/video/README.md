# Chompy — 30s vertical ad (Remotion)

Self-contained Remotion project (own `package.json`/`node_modules`); nothing here
is part of the app build or deploy.

- **Composition:** `ChompyAd` — 1080×1920 @ 30fps, 900 frames (30s).
- **Output:** `out/chompy-ad.mp4` (`npm run render`).

## Setup

```sh
npm i
npx playwright install chromium     # only for re-capturing app screenshots
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run studio` | Remotion Studio (scrub the timeline). |
| `npm run render` | Render the MP4 to `out/chompy-ad.mp4`. |
| `npm run still -- --frame=120 out/f120.png` | One frame. |
| `node tools/stills.mjs 20 75 130 …` | Several frames as PNGs into `out/stills/` (bundles once). |
| `npm run seed` | Create/refresh the demo account on the live app (phone `9000000042`, master OTP) with a logged day + dinner idea. Writes `tools/.token`. |
| `npm run shots` | Re-capture the real app screens into `public/shots/` at an iPhone viewport, plus `layout.json` (element boxes the video animates). Run `seed` first. |

## How it's built

- `src/timing.ts` — scene frame plan (Snap 0–150, Log 150–360, Nutrition
  360–600, Ask 600–780, Logo 780–900), phone geometry, caption band.
- `src/ChompyAd.tsx` — one persistent phone; each scene pushes a **real
  screenshot** of the app into it (`components/Phone.tsx`: `Shot`, `Clip`,
  `Cover`, `Tap`). Cards/pills/bars are animated by cropping regions of the same
  screenshot using the boxes in `public/shots/layout.json`, so the UI is the
  live app pixel-for-pixel.
- `src/scenes/*` — per-scene screens, overlays (chat bubbles, badge) and captions.
- `src/components/Background.tsx` — per-scene warm gradient, drifting food
  illustrations (`Foods.tsx`), grain, vignette.
- Fonts: Nunito (captions) + Caprasimo (brand, as in the app) via
  `@remotion/google-fonts`.

## Audio

Drop the ElevenLabs files into `public/audio/`:

```
music.mp3  vo-1-snap.mp3  vo-2-log.mp3  vo-3-nutrition.mp3  vo-4-ask.mp3  vo-5-logo.mp3
```

`tools/audio-manifest.mjs` runs before studio/still/render and regenerates
`src/audio-manifest.ts`; any file present is wired automatically (music at 18%
under the VO, each VO starting on its scene's first frame). Missing files are
simply skipped.
