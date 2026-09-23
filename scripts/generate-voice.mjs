#!/usr/bin/env node
/**
 * Generate the Chompy ad voiceover with ElevenLabs v3.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=sk_... node scripts/generate-voice.mjs <voiceId> [outDir]
 *
 * - <voiceId>  the ElevenLabs voice id (e.g. your Voice-Design voice)
 * - [outDir]   where to write the mp3s (default: ../marketing/video/public/audio)
 *
 * Writes vo-1-snap.mp3 … vo-5-logo.mp3 — the exact names the Remotion
 * <Audio> timeline in src/Ad.tsx expects.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_KEY = process.env.ELEVENLABS_API_KEY;
const MODEL_ID = "eleven_v3"; // ElevenLabs v3
const OUTPUT_FORMAT = "mp3_44100_128";

// v3 supports inline audio tags (e.g. [warm]) to shape delivery.
// One entry per clip; `file` matches the Remotion timeline.
const SCRIPT = [
  {
    file: "vo-1-snap.mp3",
    text: "[warm] Keeping track of what your child eats [gently] is as easy as a photo.",
  },
  {
    file: "vo-2-log.mp3",
    text: "[friendly] They snap it. You snap it. [reassuring] Chompy keeps the whole day together.",
  },
  {
    file: "vo-3-nutrition.mp3",
    text: "[warm] See what they've eaten, the nutrition they're getting, and how the day adds up.",
  },
  {
    file: "vo-4-ask.mp3",
    text: "[curious] And when you're not sure what's missing — [warmly] just ask.",
  },
  {
    file: "vo-5-logo.mp3",
    text: "[confident][upbeat] Chompy. Snap their meals. Know their nutrition.",
  },
];

// v3 stability is discrete: 0.0 Creative · 0.5 Natural · 1.0 Robust.
const VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.8,
  style: 0.0,
  use_speaker_boost: true,
};

/**
 * Generate one clip. Inputs: the line to speak and the voice id.
 * Returns the mp3 audio as a Buffer.
 */
export async function generate(script, voiceId) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${OUTPUT_FORMAT}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: script,
      model_id: MODEL_ID,
      voice_settings: VOICE_SETTINGS,
    }),
  });

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} — ${await res.text()}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const voiceId = process.argv[2] || process.env.ELEVENLABS_VOICE_ID;
  const outDir = resolve(
    process.argv[3] ||
      join(__dirname, "..", "marketing", "video", "public", "audio"),
  );

  if (!API_KEY) {
    console.error("✖ Set ELEVENLABS_API_KEY in the environment.");
    process.exit(1);
  }
  if (!voiceId) {
    console.error(
      "✖ Usage: node scripts/generate-voice.mjs <voiceId> [outDir]",
    );
    process.exit(1);
  }

  await mkdir(outDir, { recursive: true });
  console.log(`Voice: ${voiceId}  ·  Model: ${MODEL_ID}\nOutput: ${outDir}\n`);

  for (const clip of SCRIPT) {
    process.stdout.write(`  ${clip.file} … `);
    const audio = await generate(clip.text, voiceId);
    await writeFile(join(outDir, clip.file), audio);
    console.log(`ok (${(audio.length / 1024).toFixed(0)} KB)`);
  }

  console.log(`\n✔ Done. Drop-in ready for the Remotion timeline.`);
}

// Run as CLI (but allow `import { generate }` without side effects).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`\n✖ Failed: ${err.message}`);
    process.exit(1);
  });
}
