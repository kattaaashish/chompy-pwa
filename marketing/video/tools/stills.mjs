// Render a set of frames as PNG stills (bundles once). Usage:
//   node tools/stills.mjs 30 120 200 ...   (defaults to one frame per beat)
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = join(root, "out", "stills");
mkdirSync(out, { recursive: true });

const frames = process.argv.slice(2).map(Number);
const list = frames.length ? frames : [20, 75, 130, 200, 300, 400, 560, 640, 720, 850];

const serveUrl = await bundle({ entryPoint: join(root, "src", "index.ts") });
const composition = await selectComposition({ serveUrl, id: "ChompyAd" });
for (const frame of list) {
  const output = join(out, `f${String(frame).padStart(3, "0")}.png`);
  await renderStill({ composition, serveUrl, output, frame, scale: 0.5 });
  console.log("still", output);
}
