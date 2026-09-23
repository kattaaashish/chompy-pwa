// Seed a demo account on the live app so the screenshots show a real logged day.
// Usage: node tools/seed.mjs [phone]   (auth = phone + master OTP 123456)
// Writes the bearer token to tools/.token for capture.mjs.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.env.CHOMPY_URL ?? "https://chompy-pwa.ak-projects.workers.dev";
const PHONE = process.argv[2] ?? "9000000042";
const here = dirname(fileURLToPath(import.meta.url));

async function post(path, body, token, retries = 3) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body ?? {}),
    });
    const json = await res.json();
    if (json?.error) {
      if (json.error.retryable && attempt < retries) {
        console.log(`  retry ${path} (${json.error.code})`);
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      throw new Error(`${path}: ${json.error.code} ${json.error.message}`);
    }
    return json;
  }
}

console.log("login", PHONE);
await post("/auth/request-otp", { phone: PHONE });
const v = await post("/auth/verify-otp", { phone: PHONE, code: "123456" });
const token = v.session.access_token;
writeFileSync(join(here, ".token"), token);

console.log("profile");
await post(
  "/profile",
  {
    name: "Aarav",
    dateOfBirth: "2019-03-14",
    gender: "male",
    unitSystem: "metric",
    height: 118,
    weight: 21,
    dietPreference: "veg_egg",
  },
  token,
);

const day = await post("/nutrition/day", {}, token);
const have = new Set((day.meals ?? []).map((m) => m.category));

const MEALS = [
  { category: "breakfast", text: "2 idli, 1 bowl sambar, 1 banana" },
  { category: "lunch", text: "2 roti, 1 bowl dal, 1 bowl bhindi sabzi, 1 bowl curd" },
  { category: "snacks", text: "1 apple, 1 glass milk" },
];

for (const m of MEALS) {
  if (have.has(m.category)) {
    console.log("skip", m.category, "(already logged)");
    continue;
  }
  console.log("extract", m.category, "-", m.text);
  const ex = await post("/meal/extract", { mode: "text", text: m.text }, token);
  const items = (ex.items ?? []).map((i) => ({
    name: i.item,
    quantity: i.quantity,
    calories: i.calories,
    food_group: i.food_group,
    nutrients: i.nutrients,
  }));
  console.log("  ->", items.map((i) => `${i.name} ${i.calories}kcal`).join(", "));
  await post(
    "/meal/log",
    {
      category: m.category,
      items,
      clientToken: crypto.randomUUID(),
      photoPath: null,
      input: { mode: "text", text: m.text, extractedItems: items },
    },
    token,
  );
}

console.log("recommendation");
const rec = await post("/recommendation/refresh", {}, token);
console.log(JSON.stringify(rec.items, null, 2));
console.log("done; token saved to tools/.token");
