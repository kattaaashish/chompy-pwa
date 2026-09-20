// Read the food log — the day ledger (Home + My food "Today") and the last seven
// IST days (My food "This week"). Both also return the child's daily requirement.
// Ported from the Supabase nutrition-day / nutrition-week functions.

import { Hono } from "hono";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import type { Env, Vars } from "../lib/env";
import { apiError } from "../lib/http";
import { requireAuth } from "../lib/auth";
import { db } from "../db/client";
import { mealItems, meals } from "../db/schema";
import { istDayKey, istDayRange, sumNutrition } from "../../shared/nutrition";
import { loadDailyRequirement } from "../lib/requirement";

export const nutrition = new Hono<{ Bindings: Env; Variables: Vars }>();

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;

// Fetch every meal (+ its items) for one profile in a UTC range, oldest first.
async function fetchMeals(database: ReturnType<typeof db>, profileId: string, startUtc: string, endUtc: string) {
  const mealRows = await database
    .select()
    .from(meals)
    .where(and(eq(meals.profileId, profileId), gte(meals.loggedAt, startUtc), lt(meals.loggedAt, endUtc)))
    .all();
  mealRows.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));

  const ids = mealRows.map((m) => m.id);
  const itemRows = ids.length
    ? await database.select().from(mealItems).where(inArray(mealItems.mealId, ids)).all()
    : [];

  const itemsByMeal = new Map<string, (typeof mealItems.$inferSelect)[]>();
  for (const it of itemRows) {
    const arr = itemsByMeal.get(it.mealId) ?? [];
    arr.push(it);
    itemsByMeal.set(it.mealId, arr);
  }
  return { mealRows, itemsByMeal };
}

function shapeItems(its: (typeof mealItems.$inferSelect)[]) {
  return its
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((it) => ({
      name: it.name,
      quantity: { amount: it.quantityAmount, unit: it.quantityUnit },
      calories: it.calories,
      food_group: it.foodGroup ?? "other",
      nutrients: it.nutrients ?? [],
    }));
}

nutrition.post("/nutrition/day", requireAuth, async (c) => {
  const userId = c.get("userId");
  const database = db(c.env);
  const body = await c.req.json().catch(() => ({}));
  const { date, startUtc, endUtc } = istDayRange(
    typeof body?.date === "string" ? body.date : undefined,
  );

  let mealRows, itemsByMeal;
  try {
    ({ mealRows, itemsByMeal } = await fetchMeals(database, userId, startUtc, endUtc));
  } catch (e) {
    console.error(`[nutrition-day] ${e}`);
    return apiError(c, "server_error", "Couldn't load the day's log.", 500, { retryable: true });
  }

  const mealsOut = mealRows.map((m) => ({
    id: m.id,
    category: m.category,
    logged_at: m.loggedAt,
    total_calories: m.totalCalories,
    total_nutrients: m.totalNutrients ?? [],
    items: shapeItems(itemsByMeal.get(m.id) ?? []),
  }));

  const totals = sumNutrition(
    mealRows.map((m) => ({ calories: Number(m.totalCalories), nutrients: m.totalNutrients ?? [] })),
  );

  let requirement = null;
  try {
    requirement = await loadDailyRequirement(database, userId);
  } catch (e) {
    console.error(`[nutrition-day] requirement: ${e}`);
  }

  return c.json({
    date,
    meals: mealsOut,
    totals: { calories: totals.calories, nutrients: totals.nutrients },
    requirement,
  });
});

nutrition.post("/nutrition/week", requireAuth, async (c) => {
  const userId = c.get("userId");
  const database = db(c.env);

  const today = istDayRange();
  const todayStart = new Date(today.startUtc).getTime();
  const windowStartUtc = new Date(todayStart - (WEEK_DAYS - 1) * DAY_MS).toISOString();
  const windowEndUtc = today.endUtc;

  const order: string[] = [];
  const buckets = new Map<string, { category: string; items: (typeof mealItems.$inferSelect)[] }[]>();
  for (let i = WEEK_DAYS - 1; i >= 0; i--) {
    const key = istDayKey(new Date(todayStart - i * DAY_MS));
    buckets.set(key, []);
    order.push(key);
  }

  let mealRows, itemsByMeal;
  try {
    ({ mealRows, itemsByMeal } = await fetchMeals(database, userId, windowStartUtc, windowEndUtc));
  } catch (e) {
    console.error(`[nutrition-week] ${e}`);
    return apiError(c, "server_error", "Couldn't load the week's log.", 500, { retryable: true });
  }

  for (const m of mealRows) {
    const key = istDayKey(new Date(m.loggedAt));
    buckets.get(key)?.push({ category: m.category, items: itemsByMeal.get(m.id) ?? [] });
  }

  const days = order.map((date) => ({
    date,
    meals: (buckets.get(date) ?? []).map((m) => ({
      category: m.category,
      items: shapeItems(m.items),
    })),
  }));

  let requirement = null;
  try {
    requirement = await loadDailyRequirement(database, userId);
  } catch (e) {
    console.error(`[nutrition-week] requirement: ${e}`);
  }

  return c.json({ days, requirement });
});
