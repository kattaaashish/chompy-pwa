// Dinner recommendation: deterministic nutrient-gap analysis + an LLM that turns
// the gaps + diet preference into 2-3 concrete Indian foods a child would eat.

import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { createLlm, type Llm } from "../../shared/llm";
import { istDayRange, type Nutrient, sumNutrition } from "../../shared/nutrition";
import { ageInYears, type DailyRequirement } from "../../shared/requirements";
import type { Env } from "./env";
import { db } from "../db/client";
import { mealItems, meals, profiles, pushSubscriptions, recommendations } from "../db/schema";
import { loadDailyRequirement } from "./requirement";
import { sendPush } from "./webpush";

export type DietPreference = "veg" | "veg_egg" | "nonveg";

export interface RecoResult {
  status: "ok" | "not_enough_logged";
  items: { item: string; reason: string }[];
}

// Run the full pipeline for one profile: gate on breakfast+lunch, analyse gaps,
// ask the LLM, store the result, and (optionally) push it. Shared by the 7pm
// cron and the manual "suggest now" endpoint.
export async function generateRecommendation(
  env: Env,
  profile: { id: string; name: string | null; dateOfBirth: string | null; dietPreference: string | null },
  opts: { push: boolean },
): Promise<RecoResult> {
  const database = db(env);
  const { date, startUtc, endUtc } = istDayRange();

  const mealRows = await database
    .select()
    .from(meals)
    .where(and(eq(meals.profileId, profile.id), gte(meals.loggedAt, startUtc), lt(meals.loggedAt, endUtc)))
    .all();

  const cats = new Set(mealRows.map((m) => m.category));
  if (!(cats.has("breakfast") && cats.has("lunch"))) {
    return { status: "not_enough_logged", items: [] };
  }

  const ids = mealRows.map((m) => m.id);
  const items = ids.length
    ? await database.select().from(mealItems).where(inArray(mealItems.mealId, ids)).all()
    : [];

  const consumed = sumNutrition(
    mealRows.map((m) => ({ calories: Number(m.totalCalories), nutrients: m.totalNutrients ?? [] })),
  );
  const requirement = await loadDailyRequirement(database, profile.id);
  const gapSummary = buildGapSummary(consumed, requirement, items.map((i) => i.foodGroup ?? "other"));
  const ageYears = profile.dateOfBirth ? ageInYears(profile.dateOfBirth) : 7;

  const llm = createLlm(env.ANTHROPIC_API_KEY, env.CHOMPY_LLM_MODEL);
  const suggestions = await suggestFoods(llm, {
    ageYears,
    preference: (profile.dietPreference ?? "veg") as DietPreference,
    gapSummary,
    eaten: items.map((i) => i.name),
  });
  if (!suggestions.length) return { status: "ok", items: [] };

  await database
    .insert(recommendations)
    .values({ id: crypto.randomUUID(), profileId: profile.id, date, items: suggestions })
    .onConflictDoUpdate({
      target: [recommendations.profileId, recommendations.date],
      set: { items: suggestions },
    })
    .run();

  if (opts.push) {
    const subs = await database
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.profileId, profile.id))
      .all();
    const payload = JSON.stringify({
      title: `Dinner idea for ${profile.name || "tonight"} 🍽️`,
      body: suggestions.map((s) => s.item).join(", "),
      url: "/",
    });
    for (const sub of subs) {
      try {
        await sendPush(env, { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      } catch (e) {
        console.error(`[recommend] push failed: ${e}`);
      }
    }
  }

  return { status: "ok", items: suggestions };
}

// Cron entry: run for every completed profile.
export async function runDailyRecommendations(env: Env): Promise<void> {
  const profs = await db(env).select().from(profiles).where(eq(profiles.isProfileComplete, true)).all();
  for (const p of profs) {
    try {
      await generateRecommendation(env, p, { push: true });
    } catch (e) {
      console.error(`[recommend] profile ${p.id} failed: ${e}`);
    }
  }
}

const NUTRIENT_LABEL: Record<string, string> = {
  protein: "Protein",
  carbohydrates: "Carbs",
  fat: "Fat",
  fibre: "Fibre",
  calcium: "Calcium",
  iron: "Iron",
  zinc: "Zinc",
  vitamin_a: "Vitamin A",
  vitamin_c: "Vitamin C",
  vitamin_d: "Vitamin D",
  vitamin_b12: "Vitamin B12",
  folate: "Folate",
  iodine: "Iodine",
  magnesium: "Magnesium",
};

// Map a backend food group to one of the 5 coarse families (mirrors the client).
function familyOf(group: string): string | null {
  switch (group) {
    case "cereals_millets":
    case "roots_tubers":
    case "grains_cereals":
      return "grains";
    case "pulses_legumes":
    case "eggs":
    case "meat_poultry":
    case "fish_seafood":
    case "nuts_seeds":
    case "egg_meat_fish":
      return "protein foods";
    case "green_leafy_vegetables":
    case "other_vegetables":
    case "vegetables":
      return "vegetables";
    case "fruits":
      return "fruit";
    case "milk_dairy":
      return "dairy";
    default:
      return null;
  }
}

const ALL_FAMILIES = ["grains", "protein foods", "vegetables", "fruit", "dairy"];

// Build a compact, human-readable summary of what's still short today.
export function buildGapSummary(
  consumed: { calories: number; nutrients: Nutrient[] },
  req: DailyRequirement,
  foodGroups: string[],
): string {
  const got = new Map(consumed.nutrients.map((n) => [n.nutrient_type, n.value]));

  const under: { label: string; pct: number }[] = [];
  for (const n of req.nutrients) {
    if (n.value <= 0) continue;
    const pct = Math.round(((got.get(n.nutrient_type) ?? 0) / n.value) * 100);
    if (pct < 80) under.push({ label: NUTRIENT_LABEL[n.nutrient_type] ?? n.nutrient_type, pct });
  }
  under.sort((a, b) => a.pct - b.pct);

  const calPct = req.calories > 0 ? Math.round((consumed.calories / req.calories) * 100) : 100;

  const eatenFamilies = new Set(foodGroups.map(familyOf).filter(Boolean) as string[]);
  const missed = ALL_FAMILIES.filter((f) => !eatenFamilies.has(f));

  const parts = [`Calories: ${calPct}% of the day's target.`];
  if (under.length) {
    parts.push(
      `Below target: ${under.slice(0, 6).map((u) => `${u.label} (${u.pct}%)`).join(", ")}.`,
    );
  }
  if (missed.length) parts.push(`Food families not eaten yet today: ${missed.join(", ")}.`);
  if (under.length === 0 && missed.length === 0) parts.push("The day is well balanced so far.");
  return parts.join(" ");
}

const PREF_TEXT: Record<DietPreference, string> = {
  veg: "vegetarian — absolutely no egg, meat, or fish",
  veg_egg: "vegetarian but eggs are allowed — no meat or fish",
  nonveg: "eats everything, including egg, chicken, and fish",
};

const SUGGEST_SYSTEM =
  `You are a paediatric nutrition assistant for an Indian family. A child has eaten some meals today; you are given the remaining nutrient gaps and the child's dietary preference. Suggest 2-3 specific, realistic foods for dinner or an evening snack that a child would actually enjoy eating, prioritising the biggest gaps.
Rules:
- Common Indian home foods, not recipes (e.g. "paneer bhurji", "a bowl of curd", "orange", "palak dal", "boiled egg").
- STRICTLY respect the dietary preference. Never suggest a food that violates it.
- Prefer foods that fill the largest gaps and add any missing food families.
- For each: a short, warm, kid-friendly reason. No numbers, calories, or nutrient jargon in the reason.
- Return 2-3 items.`;

const SUGGEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { item: { type: "string" }, reason: { type: "string" } },
        required: ["item", "reason"],
      },
    },
  },
  required: ["suggestions"],
};

export async function suggestFoods(
  llm: Llm,
  input: { ageYears: number; preference: DietPreference; gapSummary: string; eaten: string[] },
): Promise<{ item: string; reason: string }[]> {
  const raw = await llm.generateJson<{ suggestions: { item: string; reason: string }[] }>({
    system: SUGGEST_SYSTEM,
    content: [
      {
        type: "text",
        text: `Child age: ${input.ageYears} years.
Dietary preference: ${PREF_TEXT[input.preference]}.
Already eaten today: ${input.eaten.length ? input.eaten.join(", ") : "nothing recorded"}.
Nutrient gaps to fill tonight: ${input.gapSummary}`,
      },
    ],
    schema: SUGGEST_SCHEMA,
    // Reasoning-sensitive: let the model think first (unconstrained by the
    // schema), at high effort. maxTokens leaves room for thinking + JSON.
    thinking: true,
    effort: "high",
    maxTokens: 1500,
  });
  return (raw.suggestions ?? [])
    .filter((s) => s && typeof s.item === "string" && s.item.trim())
    .slice(0, 3)
    .map((s) => ({ item: s.item.trim(), reason: (s.reason ?? "").trim() }));
}
