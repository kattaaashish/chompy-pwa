// The read-only Chompy MCP server — tools that expose one account's food log to
// an external AI harness (Claude, ChatGPT, Cursor, ...). Everything here is a
// SELECT; there is deliberately no tool that writes.
//
// What's exposed, per meal:
//   • raw input      — the typed sentence, or the plate photo (get_meal_photo)
//   • the app's work — extracted_items: the review table exactly as the LLM
//                      produced it (pre-edit), then the saved items with the
//                      per-item nutrition estimate and food group, and the
//                      cached meal totals
//   • context        — the child's profile and the ICMR-NIN based daily
//                      requirement, so consumption can be judged against needs.
//
// A fresh McpServer is built per request (stateless Streamable HTTP), scoped to
// the authenticated userId — every query filters by profile_id.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import type { Env } from "../lib/env";
import { db, type DB } from "../db/client";
import { bodyMeasurements, mealItems, meals, profiles, recommendations } from "../db/schema";
import { loadDailyRequirement } from "../lib/requirement";
import {
  FOOD_GROUPS,
  FOOD_GROUP_EXAMPLES,
  FOOD_GROUP_FUNCTION,
  MEAL_CATEGORIES,
  NUTRIENT_SET,
  type Nutrient,
  istDayKey,
  istDayRange,
  sumNutrition,
} from "../../shared/nutrition";
import { ageInYears } from "../../shared/requirements";

export const SERVER_NAME = "chompy";
export const SERVER_VERSION = "1.0.0";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 7;
const MAX_RANGE_DAYS = 366;
const MAX_MEALS = 500;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // inline image cap (matches typical model limits)

type MealRow = typeof meals.$inferSelect;
type ItemRow = typeof mealItems.$inferSelect;

// ── Helpers ─────────────────────────────────────────────────────────────────
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function json(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function toolError(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

// Resolve an optional IST date range. Default: the last 7 IST days ending today.
function resolveRange(from?: string, to?: string) {
  if (from && !ISO_DATE.test(from)) throw new Error(`from_date must be YYYY-MM-DD, got "${from}"`);
  if (to && !ISO_DATE.test(to)) throw new Error(`to_date must be YYYY-MM-DD, got "${to}"`);
  const toRange = istDayRange(to);
  let fromRange = from
    ? istDayRange(from)
    : istDayRange(istDayKey(new Date(new Date(toRange.startUtc).getTime() - (DEFAULT_RANGE_DAYS - 1) * DAY_MS)));
  if (fromRange.startUtc > toRange.startUtc) [fromRange] = [toRange];
  const days = Math.round((new Date(toRange.startUtc).getTime() - new Date(fromRange.startUtc).getTime()) / DAY_MS) + 1;
  if (days > MAX_RANGE_DAYS) throw new Error(`Range too large (${days} days); max ${MAX_RANGE_DAYS}.`);
  return { from: fromRange.date, to: toRange.date, startUtc: fromRange.startUtc, endUtc: toRange.endUtc, days };
}

function listDays(startUtc: string, days: number): string[] {
  const start = new Date(startUtc).getTime();
  return Array.from({ length: days }, (_, i) => istDayKey(new Date(start + i * DAY_MS)));
}

function nutrientsToObject(nutrients: Nutrient[]): Record<string, { value: number; unit: string }> {
  const out: Record<string, { value: number; unit: string }> = {};
  for (const n of nutrients) out[n.nutrient_type] = { value: n.value, unit: n.unit };
  return out;
}

function pct(actual: number, target: number): number | null {
  if (!target) return null;
  return Math.round((actual / target) * 100);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// ── Data access (all scoped to userId) ──────────────────────────────────────
async function fetchMealsInRange(
  database: DB,
  userId: string,
  startUtc: string,
  endUtc: string,
  category?: string,
) {
  const where = [eq(meals.profileId, userId), gte(meals.loggedAt, startUtc), lt(meals.loggedAt, endUtc)];
  if (category) where.push(eq(meals.category, category as MealRow["category"]));
  const rows = await database.select().from(meals).where(and(...where)).all();
  rows.sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)); // newest first
  return rows;
}

async function fetchItemsFor(database: DB, mealIds: string[]) {
  const byMeal = new Map<string, ItemRow[]>();
  for (let i = 0; i < mealIds.length; i += 90) {
    // D1 caps bound parameters; chunk the IN list.
    const chunk = mealIds.slice(i, i + 90);
    const rows = await database.select().from(mealItems).where(inArray(mealItems.mealId, chunk)).all();
    for (const it of rows) {
      const arr = byMeal.get(it.mealId) ?? [];
      arr.push(it);
      byMeal.set(it.mealId, arr);
    }
  }
  for (const arr of byMeal.values()) arr.sort((a, b) => a.position - b.position);
  return byMeal;
}

async function fetchOwnedMeal(database: DB, userId: string, mealId: string) {
  return await database
    .select()
    .from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.profileId, userId)))
    .get();
}

function shapeItem(it: ItemRow, includeNutrients: boolean) {
  return {
    name: it.name,
    quantity: { amount: it.quantityAmount, unit: it.quantityUnit },
    food_group: it.foodGroup ?? "other",
    food_function: FOOD_GROUP_FUNCTION[(it.foodGroup ?? "other") as keyof typeof FOOD_GROUP_FUNCTION] ?? null,
    calories: it.calories, // null = estimation failed for this item
    ...(includeNutrients ? { nutrients: nutrientsToObject(it.nutrients ?? []) } : {}),
  };
}

function shapeMeal(
  m: MealRow,
  items: ItemRow[],
  opts: { includeNutrients: boolean; includeRawInput: boolean },
) {
  const mode = m.inputMode ?? (m.photoPath ? "photo" : null);
  return {
    id: m.id,
    category: m.category,
    logged_at_utc: m.loggedAt,
    date_ist: istDayKey(new Date(m.loggedAt)),
    totals: {
      calories: m.totalCalories,
      ...(opts.includeNutrients ? { nutrients: nutrientsToObject(m.totalNutrients ?? []) } : {}),
    },
    items: items.map((it) => shapeItem(it, opts.includeNutrients)),
    ...(opts.includeRawInput
      ? {
          input: {
            mode, // "text" | "photo" | null (meals saved before raw input was recorded)
            text: m.inputText ?? null,
            has_photo: Boolean(m.photoPath),
            photo_hint: m.photoPath ? `Call get_meal_photo with meal_id "${m.id}" to view the plate photo.` : null,
            // The review table exactly as Chompy's LLM produced it, before the
            // child edited/confirmed it. Compare with `items` to see edits.
            extracted_items: m.extractedItems
              ? m.extractedItems.map((e) => ({
                  name: e.name,
                  quantity: e.quantity,
                  food_group: e.food_group,
                  calories: e.calories,
                  ...(opts.includeNutrients ? { nutrients: nutrientsToObject(e.nutrients ?? []) } : {}),
                }))
              : null,
          },
        }
      : {}),
  };
}

async function loadProfile(database: DB, userId: string) {
  const p = await database.select().from(profiles).where(eq(profiles.id, userId)).get();
  if (!p) throw new Error("Profile not found.");
  const measurements = await database
    .select()
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.profileId, userId))
    .orderBy(desc(bodyMeasurements.measuredAt))
    .limit(20)
    .all();
  const latest = measurements[0];
  const requirement = await loadDailyRequirement(database, userId);
  return {
    name: p.name,
    phone_masked: p.phone ? `••••••${p.phone.slice(-4)}` : null,
    date_of_birth: p.dateOfBirth,
    age_years: p.dateOfBirth ? ageInYears(p.dateOfBirth) : null,
    gender: p.gender,
    diet_preference: p.dietPreference,
    profile_complete: p.isProfileComplete,
    created_at: p.createdAt,
    latest_measurement: latest
      ? { height_cm: latest.heightCm, weight_kg: latest.weightKg, measured_at: latest.measuredAt }
      : null,
    measurement_history: measurements.map((m) => ({
      height_cm: m.heightCm,
      weight_kg: m.weightKg,
      measured_at: m.measuredAt,
    })),
    daily_requirement: {
      method:
        "ICMR-NIN RDA bracket by age + sex; energy and protein scale linearly with the latest recorded weight (reference weight if none).",
      calories_kcal: requirement.calories,
      nutrients: nutrientsToObject(requirement.nutrients),
    },
  };
}

// ── Server ──────────────────────────────────────────────────────────────────
export function buildServer(env: Env, userId: string, base: string): McpServer {
  const database = db(env);

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions: [
        "Chompy is a kids' meal-logging app. This server is READ-ONLY and scoped to the signed-in account.",
        "Dates are IST (Asia/Kolkata) calendar days in YYYY-MM-DD; a meal's `date_ist` is the IST day it was logged on.",
        "Nutrition values are LLM estimates (not a food database) — treat them as approximate.",
        "Per meal you get the raw input (typed text, or a plate photo via get_meal_photo), Chompy's pre-edit extraction (`input.extracted_items`), the confirmed items with per-item nutrition + food group, and totals.",
        "Start with get_profile (daily requirement) and get_nutrition_summary (day-by-day vs requirement); use list_meals / get_meal for detail.",
      ].join(" "),
    },
  );

  const wrap =
    <A>(fn: (args: A) => Promise<CallToolResult>) =>
    async (args: A): Promise<CallToolResult> => {
      try {
        return await fn(args);
      } catch (e) {
        return toolError(e instanceof Error ? e.message : String(e));
      }
    };

  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const dateArgs = {
    from_date: z.string().optional().describe("Start IST day, YYYY-MM-DD (inclusive). Default: 6 days before to_date."),
    to_date: z.string().optional().describe("End IST day, YYYY-MM-DD (inclusive). Default: today (IST)."),
  };

  server.registerTool(
    "get_profile",
    {
      title: "Child profile & daily requirement",
      description:
        "The child's profile (name, age, sex, diet preference, height/weight history) and the personalised daily nutrition requirement Chompy measures intake against.",
      inputSchema: {},
      annotations: readOnly,
    },
    wrap(async () => json(await loadProfile(database, userId))),
  );

  server.registerTool(
    "list_meals",
    {
      title: "List logged meals",
      description:
        "Meals logged in an IST date range (default last 7 days), newest first, each with confirmed items, per-item nutrition, meal totals and the raw input (typed text / photo flag / Chompy's pre-edit extraction).",
      inputSchema: {
        ...dateArgs,
        category: z.enum(MEAL_CATEGORIES).optional().describe("Only this meal category."),
        limit: z.number().int().min(1).max(MAX_MEALS).optional().describe(`Max meals to return (default 100, max ${MAX_MEALS}).`),
        include_nutrients: z.boolean().optional().describe("Include per-item and total nutrient breakdowns (default true). Set false for a compact list."),
        include_raw_input: z.boolean().optional().describe("Include the raw input + pre-edit extraction (default true)."),
      },
      annotations: readOnly,
    },
    wrap(async (a) => {
      const range = resolveRange(a.from_date, a.to_date);
      const rows = await fetchMealsInRange(database, userId, range.startUtc, range.endUtc, a.category);
      const limited = rows.slice(0, a.limit ?? 100);
      const items = await fetchItemsFor(database, limited.map((m) => m.id));
      return json({
        range: { from_date: range.from, to_date: range.to, timezone: "Asia/Kolkata" },
        total_in_range: rows.length,
        returned: limited.length,
        meals: limited.map((m) =>
          shapeMeal(m, items.get(m.id) ?? [], {
            includeNutrients: a.include_nutrients ?? true,
            includeRawInput: a.include_raw_input ?? true,
          }),
        ),
      });
    }),
  );

  server.registerTool(
    "get_meal",
    {
      title: "Get one meal",
      description: "Everything Chompy stored for one meal: raw input, pre-edit extraction, confirmed items with nutrition, totals, and whether a photo exists.",
      inputSchema: { meal_id: z.string().describe("Meal id from list_meals / search.") },
      annotations: readOnly,
    },
    wrap(async (a) => {
      const m = await fetchOwnedMeal(database, userId, a.meal_id);
      if (!m) return toolError(`No meal with id ${a.meal_id} on this account.`);
      const items = await fetchItemsFor(database, [m.id]);
      return json(shapeMeal(m, items.get(m.id) ?? [], { includeNutrients: true, includeRawInput: true }));
    }),
  );

  server.registerTool(
    "get_meal_photo",
    {
      title: "Get a meal's plate photo",
      description: "Returns the plate photo the child took for a photo-logged meal as an image, plus its size and type. Text-logged meals have no photo.",
      inputSchema: { meal_id: z.string().describe("Meal id.") },
      annotations: readOnly,
    },
    wrap(async (a) => {
      const m = await fetchOwnedMeal(database, userId, a.meal_id);
      if (!m) return toolError(`No meal with id ${a.meal_id} on this account.`);
      if (!m.photoPath) return json({ meal_id: m.id, has_photo: false, input_mode: m.inputMode, text: m.inputText });
      // Defence in depth: photo keys are namespaced by owner.
      if (!m.photoPath.startsWith(`${userId}/`)) return toolError("Photo does not belong to this account.");
      const obj = await env.PHOTOS.get(m.photoPath);
      if (!obj) return toolError("Photo is missing from storage.");
      const mimeType = obj.httpMetadata?.contentType ?? "image/jpeg";
      const meta = { meal_id: m.id, has_photo: true, mime_type: mimeType, bytes: obj.size, category: m.category, logged_at_utc: m.loggedAt };
      if (obj.size > MAX_PHOTO_BYTES) {
        return json({ ...meta, note: `Photo is ${(obj.size / 1024 / 1024).toFixed(1)} MB, above the ${MAX_PHOTO_BYTES / 1024 / 1024} MB inline limit; not returned.` });
      }
      const bytes = new Uint8Array(await obj.arrayBuffer());
      return {
        content: [
          { type: "text", text: JSON.stringify(meta) },
          { type: "image", data: bytesToBase64(bytes), mimeType },
        ],
      };
    }),
  );

  server.registerTool(
    "get_nutrition_summary",
    {
      title: "Daily nutrition vs requirement",
      description:
        "Day-by-day totals (calories + every nutrient) over an IST date range (default last 7 days), each as an absolute value and a % of the child's daily requirement, plus meal counts, a food-group / GO-GROW-GLOW breakdown, and range averages. This mirrors the calculations behind Chompy's Home and My Food screens.",
      inputSchema: dateArgs,
      annotations: readOnly,
    },
    wrap(async (a) => {
      const range = resolveRange(a.from_date, a.to_date);
      const requirement = await loadDailyRequirement(database, userId);
      const reqByKey = nutrientsToObject(requirement.nutrients);
      const rows = await fetchMealsInRange(database, userId, range.startUtc, range.endUtc);
      const itemsByMeal = await fetchItemsFor(database, rows.map((m) => m.id));

      const byDay = new Map<string, MealRow[]>();
      for (const d of listDays(range.startUtc, range.days)) byDay.set(d, []);
      for (const m of rows) byDay.get(istDayKey(new Date(m.loggedAt)))?.push(m);

      const days = [...byDay.entries()].map(([date, dayMeals]) => {
        const totals = sumNutrition(
          dayMeals.map((m) => ({ calories: Number(m.totalCalories), nutrients: m.totalNutrients ?? [] })),
        );
        const nutrients: Record<string, { value: number; unit: string; requirement: number; percent_of_requirement: number | null }> = {};
        for (const n of NUTRIENT_SET) {
          const got = totals.nutrients.find((x) => x.nutrient_type === n.key)?.value ?? 0;
          const req = reqByKey[n.key]?.value ?? 0;
          nutrients[n.key] = { value: Math.round(got * 10) / 10, unit: n.unit, requirement: req, percent_of_requirement: pct(got, req) };
        }
        const groups: Record<string, { items: number; calories: number }> = {};
        const functions: Record<string, { items: number; calories: number }> = { go: { items: 0, calories: 0 }, grow: { items: 0, calories: 0 }, glow: { items: 0, calories: 0 }, other: { items: 0, calories: 0 } };
        for (const m of dayMeals) {
          for (const it of itemsByMeal.get(m.id) ?? []) {
            const g = it.foodGroup ?? "other";
            const fn = FOOD_GROUP_FUNCTION[g as keyof typeof FOOD_GROUP_FUNCTION] ?? "other";
            groups[g] = groups[g] ?? { items: 0, calories: 0 };
            groups[g].items += 1;
            groups[g].calories += it.calories ?? 0;
            functions[fn].items += 1;
            functions[fn].calories += it.calories ?? 0;
          }
        }
        const byCategory: Record<string, number> = {};
        for (const m of dayMeals) byCategory[m.category] = (byCategory[m.category] ?? 0) + 1;
        return {
          date,
          meal_count: dayMeals.length,
          meals_by_category: byCategory,
          calories: { value: Math.round(totals.calories), requirement: requirement.calories, percent_of_requirement: pct(totals.calories, requirement.calories) },
          nutrients,
          food_groups: groups,
          go_grow_glow: functions,
        };
      });

      const loggedDays = days.filter((d) => d.meal_count > 0);
      const avg = (pick: (d: (typeof days)[number]) => number) =>
        loggedDays.length ? Math.round((loggedDays.reduce((s, d) => s + pick(d), 0) / loggedDays.length) * 10) / 10 : null;
      const averageNutrients: Record<string, { value: number | null; unit: string; percent_of_requirement: number | null }> = {};
      for (const n of NUTRIENT_SET) {
        const v = avg((d) => d.nutrients[n.key].value);
        averageNutrients[n.key] = { value: v, unit: n.unit, percent_of_requirement: v == null ? null : pct(v, reqByKey[n.key]?.value ?? 0) };
      }

      return json({
        range: { from_date: range.from, to_date: range.to, days: range.days, timezone: "Asia/Kolkata" },
        requirement: { calories_kcal: requirement.calories, nutrients: reqByKey },
        days,
        averages_over_logged_days: {
          logged_days: loggedDays.length,
          calories: { value: avg((d) => d.calories.value), percent_of_requirement: (() => { const v = avg((d) => d.calories.value); return v == null ? null : pct(v, requirement.calories); })() },
          nutrients: averageNutrients,
        },
        notes: [
          "Totals come from the cached per-meal totals Chompy saves (same numbers the app shows).",
          "Food-group calories skip items whose estimation failed (calories null).",
        ],
      });
    }),
  );

  server.registerTool(
    "get_recommendations",
    {
      title: "Dinner recommendations",
      description: "Chompy's daily dinner suggestions (generated each evening from the day's nutrient gaps) for an IST date range, default last 7 days.",
      inputSchema: dateArgs,
      annotations: readOnly,
    },
    wrap(async (a) => {
      const range = resolveRange(a.from_date, a.to_date);
      const rows = await database
        .select()
        .from(recommendations)
        .where(and(eq(recommendations.profileId, userId), gte(recommendations.date, range.from), lt(recommendations.date, `${range.to}~`)))
        .all();
      rows.sort((x, y) => y.date.localeCompare(x.date));
      return json({
        range: { from_date: range.from, to_date: range.to },
        recommendations: rows.map((r) => ({ date: r.date, items: r.items, created_at: r.createdAt })),
      });
    }),
  );

  const reference = {
    meal_categories: MEAL_CATEGORIES,
    nutrients: NUTRIENT_SET.map((n) => ({ key: n.key, unit: n.unit })),
    food_groups: FOOD_GROUPS.map((g) => ({
      key: g,
      function: FOOD_GROUP_FUNCTION[g],
      examples: g === "other" ? "water, tea, mixed dishes that fit no family" : FOOD_GROUP_EXAMPLES[g],
    })),
    go_grow_glow: {
      go: "energy foods — cereals/millets, roots/tubers, fats/oils, sugars",
      grow: "body-building foods — pulses, dairy, nuts/seeds, eggs, meat, fish",
      glow: "protective foods — green leafy vegetables, other vegetables, fruits",
    },
    how_chompy_calculates: {
      input: "The child types what they ate, or photographs the plate (photo stored as-is).",
      extraction: "An LLM lists the food items with quantities. Text: trust stated quantities (fast model). Photo: estimate portions from the image (vision model).",
      estimation: "For each item an LLM estimates calories + the nutrient set above and assigns a food group. On the photo path the image is passed in so portions come from pixels.",
      review: "The child can edit items/quantities before saving; edited items are re-estimated. `input.extracted_items` is the pre-edit table, `items` the saved one.",
      totals: "Meal totals = sum of item values; day totals = sum of meal totals for the IST calendar day.",
      requirement: "ICMR-NIN RDA by age bracket + sex; energy and protein scale with recorded weight.",
      caveat: "All nutrition numbers are model estimates, not a food-composition database.",
    },
    timezone: "Asia/Kolkata (IST, UTC+5:30). A day runs 00:00–24:00 IST.",
  };

  server.registerTool(
    "get_reference",
    {
      title: "Reference: nutrients, food groups, method",
      description: "The fixed vocabulary Chompy uses (nutrient keys/units, food groups and their GO/GROW/GLOW function, meal categories) and a plain-language description of how the numbers are computed.",
      inputSchema: {},
      annotations: readOnly,
    },
    wrap(async () => json(reference)),
  );

  server.registerResource(
    "reference",
    "chompy://reference",
    { title: "Chompy nutrition model reference", mimeType: "application/json", description: "Nutrient set, food groups, and how Chompy calculates." },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(reference, null, 2) }] }),
  );

  // ── ChatGPT connector contract: `search` + `fetch` ────────────────────────
  // ChatGPT (and some other harnesses) expect exactly these two tools. They
  // wrap the same data: search over meals by food name / typed text / date.
  const mealUrl = (id: string) => `${base}/?meal=${id}`;

  server.registerTool(
    "search",
    {
      title: "Search meals",
      description:
        "Search logged meals by food name, typed text, category or IST date (YYYY-MM-DD / YYYY-MM). Returns ids for fetch. Empty query = most recent meals.",
      inputSchema: { query: z.string().describe("Free text, e.g. 'dosa', 'lunch 2026-09', '2026-09-20'.") },
      annotations: readOnly,
    },
    wrap(async (a) => {
      const q = a.query.trim().toLowerCase();
      const dateTerm = q.match(/\d{4}-\d{2}(-\d{2})?/)?.[0];
      const terms = q.replace(/\d{4}-\d{2}(-\d{2})?/g, "").split(/\s+/).filter(Boolean);
      const rows = await database.select().from(meals).where(eq(meals.profileId, userId)).all();
      rows.sort((x, y) => y.loggedAt.localeCompare(x.loggedAt));
      const candidates = dateTerm ? rows.filter((m) => istDayKey(new Date(m.loggedAt)).startsWith(dateTerm)) : rows;
      const itemsByMeal = await fetchItemsFor(database, candidates.slice(0, MAX_MEALS).map((m) => m.id));
      const results = candidates
        .filter((m) => {
          if (terms.length === 0) return true;
          const hay = [m.category, m.inputText ?? "", ...(itemsByMeal.get(m.id) ?? []).map((i) => i.name)].join(" ").toLowerCase();
          return terms.every((t) => hay.includes(t));
        })
        .slice(0, 50)
        .map((m) => {
          const names = (itemsByMeal.get(m.id) ?? []).map((i) => i.name).join(", ");
          return { id: m.id, title: `${istDayKey(new Date(m.loggedAt))} ${m.category}: ${names || "(no items)"}`, url: mealUrl(m.id) };
        });
      return json({ results });
    }),
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch a meal document",
      description: "Full record for a meal id returned by search (same data as get_meal, wrapped as a document).",
      inputSchema: { id: z.string().describe("Meal id.") },
      annotations: readOnly,
    },
    wrap(async (a) => {
      const m = await fetchOwnedMeal(database, userId, a.id);
      if (!m) return toolError(`No meal with id ${a.id} on this account.`);
      const items = await fetchItemsFor(database, [m.id]);
      const doc = shapeMeal(m, items.get(m.id) ?? [], { includeNutrients: true, includeRawInput: true });
      return json({
        id: m.id,
        title: `${doc.date_ist} ${m.category}: ${doc.items.map((i) => i.name).join(", ")}`,
        text: JSON.stringify(doc, null, 2),
        url: mealUrl(m.id),
        metadata: { category: m.category, date_ist: doc.date_ist, has_photo: Boolean(m.photoPath), input_mode: doc.input?.mode ?? null },
      });
    }),
  );

  return server;
}
