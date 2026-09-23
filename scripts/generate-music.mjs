#!/usr/bin/env node
/**
 * Generate the Chompy ad background music with ElevenLabs Music.
 *
 * Usage:
 *   node --env-file=.env scripts/generate-music.mjs [outFile]
 *
 * - [outFile]  where to write the mp3 (default: ../marketing/video/public/audio/music.mp3)
 *
 * Reads ELEVENLABS_API_KEY from the environment. Produces a 30s gentle,
 * instrumental bed sized to the 30s ad (900 frames @ 30fps).
 */
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_KEY = process.env.ELEVENLABS_API_KEY;
const MODEL_ID = process.env.ELEVENLABS_MUSIC_MODEL || "music_v2";
const LENGTH_MS = 30_000; // match the 30s ad exactly

const PROMPT = `Gentle, warm, uplifting instrumental background music for a
children's nutrition app advert. Soft ukulele plucking, light marimba and
glockenspiel, gentle acoustic bass, subtle claps. Cozy, homey, optimistic and
friendly. Mid-tempo around 100 BPM. Simple and unobtrusive so a voiceover sits
clearly on top. Starts soft and intimate, builds gently, and resolves on a warm,
satisfying final chord. No vocals, no lyrics — instrumental only.`;

async function generateMusic() {
  const res = await fetch("https://api.elevenlabs.io/v1/music", {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      prompt: PROMPT.replace(/\s+/g, " ").trim(),
      music_length_ms: LENGTH_MS,
      model_id: MODEL_ID,
      force_instrumental: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} — ${await res.text()}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const outFile = resolve(
    process.argv[2] ||
      join(__dirname, "..", "marketing", "video", "public", "audio", "music.mp3"),
  );

  if (!API_KEY) {
    console.error("✖ Set ELEVENLABS_API_KEY (e.g. node --env-file=.env ...).");
    process.exit(1);
  }

  await mkdir(dirname(outFile), { recursive: true });
  console.log(`Model: ${MODEL_ID}  ·  Length: ${LENGTH_MS / 1000}s\nOutput: ${outFile}\n`);
  process.stdout.write("  generating music … ");
  const audio = await generateMusic();
  await writeFile(outFile, audio);
  console.log(`ok (${(audio.length / 1024).toFixed(0)} KB)`);
  console.log("\n✔ Done. Re-run the audio manifest so the video picks it up.");
}

main().catch((err) => {
  console.error(`\n✖ Failed: ${err.message}`);
  process.exit(1);
});
