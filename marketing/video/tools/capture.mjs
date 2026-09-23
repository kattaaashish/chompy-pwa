// Capture real Chompy screens from the live app at an iPhone viewport.
// Run tools/seed.mjs first (it writes tools/.token). Output: public/shots/*.png
//
//   node tools/capture.mjs

import { chromium, devices } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.env.CHOMPY_URL ?? "https://chompy-pwa.ak-projects.workers.dev";
const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "public", "shots");
const token = readFileSync(join(here, ".token"), "utf8").trim();

// iPhone 14 Pro: 393x852 CSS px @3x. The viewport is 55 CSS px shorter than
// the device so that, once the video pushes the shot down under its own
// status bar (STATUS_PAD), it fills the phone screen exactly.
const iphone = devices["iPhone 14 Pro"];
// Full Chromium (not the headless shell) so colour emoji render on macOS.
const browser = await chromium.launch({ channel: "chromium" });
const ctx = await browser.newContext({
  ...iphone,
  viewport: { width: 393, height: 797 },
  deviceScaleFactor: 3,
  colorScheme: "light",
  timezoneId: "Asia/Kolkata",
});

// Log in by token before the SPA boots; freeze CSS animations (mascot pulse /
// blink) so shots are deterministic.
await ctx.addInitScript((t) => localStorage.setItem("chompy_token", t), token);
await ctx.addInitScript(() => {
  const css = `*, *::before, *::after { animation: none !important; transition: none !important; }`;
  document.addEventListener("DOMContentLoaded", () => {
    const s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
  });
});

const page = await ctx.newPage();

// Layout boxes (CSS px, document coords) so the video can animate regions of
// the real screenshots (cards popping in, bars filling) instead of faking UI.
const layout = {};
const rect = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
};
async function measure(key, fn) {
  layout[key] = await page.evaluate(fn, rect.toString());
}

async function settle() {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}
async function shot(name, opts = {}) {
  await settle();
  await page.screenshot({ path: join(OUT, `${name}.png`), ...opts });
  console.log("shot", name);
}

await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByText("Meals today").waitFor({ timeout: 30000 });
// Let the recommendation card + day ledger arrive.
await page.waitForTimeout(1500);
// On a cold reload the store greets "Hi there!" (the name is only held in memory
// after the profile step); show the greeting the child sees after signing up.
await page.evaluate(() => {
  const h = [...document.querySelectorAll("h1")].find((e) => e.textContent?.startsWith("Hi "));
  if (h) h.textContent = "Hi Aarav!";
});
await shot("home");
await shot("home-full", { fullPage: true });
await measure("home", (rectSrc) => {
  const rect = new Function("return " + rectSrc)();
  const cards = [...document.querySelectorAll(".card")];
  const idea = cards.find((c) => c.textContent.includes("Tonight's idea"));
  const myfood = cards.find((c) => c.textContent.startsWith("My food"));
  const h2 = [...document.querySelectorAll("h2")].find((e) => e.textContent === "Meals today");
  return { idea: rect(idea), myfood: rect(myfood), mealsHeading: rect(h2), docHeight: document.documentElement.scrollHeight };
});

// Expand Lunch so the item rows show.
await page.getByText("Lunch", { exact: true }).click();
await page.waitForTimeout(300);
await shot("home-lunch-open", { fullPage: true });
await measure("homeLunchOpen", (rectSrc) => {
  const rect = new Function("return " + rectSrc)();
  const h2 = [...document.querySelectorAll("h2")].find((e) => e.textContent === "Meals today");
  const section = h2.parentElement;
  const meals = [...section.querySelectorAll(":scope > .stack > .card")].map((c) => ({
    label: c.querySelector(".body").textContent,
    box: rect(c),
  }));
  return { mealsHeading: rect(h2), meals, docHeight: document.documentElement.scrollHeight };
});
await page.getByText("Lunch", { exact: true }).click();

// My food → Today (families + nutrition bars).
await page.getByText("My food", { exact: true }).click();
await page.getByText("Your five food families").waitFor();
await shot("myfood-today");
await shot("myfood-today-full", { fullPage: true });
await measure("myfoodToday", (rectSrc) => {
  const rect = new Function("return " + rectSrc)();
  const h2s = [...document.querySelectorAll("h2")];
  const famH = h2s.find((e) => e.textContent.startsWith("Your five"));
  const nutH = h2s.find((e) => e.textContent.startsWith("Nutrition"));
  const families = [...famH.parentElement.querySelectorAll(".card")].map((c) => ({
    label: c.querySelector(".body").textContent,
    box: rect(c),
    pill: rect(c.querySelector(".pill-tag")),
  }));
  const bars = [...document.querySelectorAll(".bar-track")].map((t) => {
    const fill = t.querySelector(".bar-fill");
    const row = t.parentElement;
    return {
      label: row.querySelector(".body").textContent,
      value: row.querySelector(".body-sm").textContent,
      box: rect(t),
      percent: parseFloat(fill.style.width),
      color: getComputedStyle(fill).backgroundColor,
    };
  });
  return {
    familiesHeading: rect(famH),
    nutritionHeading: rect(nutH),
    families,
    bars,
    docHeight: document.documentElement.scrollHeight,
  };
});

// This week tab.
await page.getByRole("button", { name: "This week" }).click();
await page.waitForTimeout(2500);
await shot("myfood-week-full", { fullPage: true });

await page.getByText("← Home").click();
await page.getByText("Meals today").waitFor();

// Log-a-meal flow: mode chooser → type → review.
await page.getByRole("button", { name: /Log a meal/ }).click();
await page.getByText("What did you eat?").waitFor();
await shot("mode");
await measure("mode", (rectSrc) => {
  const rect = new Function("return " + rectSrc)();
  const cards = [...document.querySelectorAll(".card")];
  return { photo: rect(cards[0]), type: rect(cards[1]) };
});

await page.getByText("Type it", { exact: true }).click();
await page.getByText("Type your food").waitFor();
await page.locator("textarea").fill("2 idli, 1 bowl sambar, 1 banana");
await shot("type");

await page.getByRole("button", { name: /See what Chompy finds/ }).click();
await page.getByText("Chompy is looking").waitFor({ timeout: 10000 }).catch(() => {});
await shot("detecting");
await page.getByText("Is this right?").waitFor({ timeout: 120000 });
await shot("review");
await shot("review-full", { fullPage: true });
await measure("review", (rectSrc) => {
  const rect = new Function("return " + rectSrc)();
  const items = [...document.querySelectorAll(".stack > .card")].map((c) => ({
    label: c.querySelector("input").value,
    box: rect(c),
  }));
  const cta = document.querySelector(".btn-primary");
  const found = [...document.querySelectorAll(".field-label")].find((e) => e.textContent.startsWith("Chompy found"));
  return { items, cta: rect(cta), found: rect(found), docHeight: document.documentElement.scrollHeight };
});

// Ask flow on Home, before a dinner idea exists: the real "Get tonight's dinner
// idea" button, the "Thinking of ideas…" state, then the card. We already have
// today's idea stored, so mock the read as empty and hold the refresh until we
// have the shots; then answer with the stored idea so the card matches home.png.
const stored = await page.evaluate(async (t) => {
  const r = await fetch("/api/recommendation", { headers: { Authorization: `Bearer ${t}` } });
  return r.json();
}, token);
await page.route("**/api/recommendation", (route) =>
  route.fulfill({ json: { date: stored.date, items: null } }),
);
let release;
const held = new Promise((r) => (release = r));
await page.route("**/api/recommendation/refresh", async (route) => {
  await held;
  await route.fulfill({ json: { items: stored.items } });
});
await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByText("Meals today").waitFor({ timeout: 30000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const h = [...document.querySelectorAll("h1")].find((e) => e.textContent?.startsWith("Hi "));
  if (h) h.textContent = "Hi Aarav!";
});
await shot("home-ask");
await measure("homeAsk", (rectSrc) => {
  const rect = new Function("return " + rectSrc)();
  const btn = [...document.querySelectorAll(".btn-secondary")].find((b) => b.textContent.includes("dinner idea"));
  return { askButton: rect(btn), docHeight: document.documentElement.scrollHeight };
});
await page.getByRole("button", { name: /dinner idea/ }).click();
await page.getByText("Thinking of ideas").waitFor();
await shot("home-thinking");
release();
await page.getByText("Tonight's idea").waitFor();
await shot("home-idea");
await measure("homeIdea", (rectSrc) => {
  const rect = new Function("return " + rectSrc)();
  const idea = [...document.querySelectorAll(".card")].find((c) => c.textContent.includes("Tonight's idea"));
  const rows = [...idea.querySelectorAll(".stack > div")].map((d) => ({ label: d.querySelector(".body").textContent, box: rect(d) }));
  return { idea: rect(idea), rows, docHeight: document.documentElement.scrollHeight };
});

writeFileSync(join(OUT, "layout.json"), JSON.stringify({ viewport: { w: 393, h: 797 }, scale: 3, ...layout }, null, 2));
await browser.close();
console.log("done ->", OUT);
