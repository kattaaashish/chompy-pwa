// Food-logging domain logic: item extraction (photo/typed), per-item nutrition
// estimation, meal-total summation, validation, category defaulting, IST day
// bucketing. Nutrition shape: calories:number + nutrients:[{nutrient_type,value,unit}].
// LLM-using functions take an injected `Llm` (see shared/llm.ts).

import { ContentBlock, Llm, LlmError } from "./llm";

export const MEAL_CATEGORIES = ["breakfast", "lunch", "dinner", "snacks"] as const;
export type MealCategory = (typeof MEAL_CATEGORIES)[number];

export interface Quantity {
  amount: number;
  unit: string;
}

export interface Nutrient {
  nutrient_type: string;
  value: number;
  unit: string;
}

// ---------------------------------------------------------------------------
// Canonical nutrient set + food groups (nutrition assessment, dimensions 1/2).
// ---------------------------------------------------------------------------
export const NUTRIENT_SET = [
  { key: "protein", unit: "g" },
  { key: "carbohydrates", unit: "g" },
  { key: "fat", unit: "g" },
  { key: "fibre", unit: "g" },
  { key: "calcium", unit: "mg" },
  { key: "iron", unit: "mg" },
  { key: "zinc", unit: "mg" },
  { key: "vitamin_a", unit: "mcg" },
  { key: "vitamin_c", unit: "mg" },
  { key: "vitamin_d", unit: "mcg" },
  { key: "vitamin_b12", unit: "mcg" },
  { key: "folate", unit: "mcg" },
  { key: "iodine", unit: "mcg" },
  { key: "magnesium", unit: "mg" },
] as const;

export type NutrientKey = (typeof NUTRIENT_SET)[number]["key"];

export const NUTRIENT_UNIT: Record<NutrientKey, string> = Object.fromEntries(
  NUTRIENT_SET.map((n) => [n.key, n.unit]),
) as Record<NutrientKey, string>;

const NUTRIENT_KEYS = NUTRIENT_SET.map((n) => n.key);
const NUTRIENT_UNITS = [...new Set(NUTRIENT_SET.map((n) => n.unit))];

// GO / GROW / GLOW food families per the reference matrix. "other" is the escape
// hatch for items that fit no family (water, tea, a mixed dish).
export const FOOD_GROUPS = [
  "cereals_millets",
  "roots_tubers",
  "fats_oils",
  "sugars_sweets",
  "pulses_legumes",
  "milk_dairy",
  "nuts_seeds",
  "eggs",
  "meat_poultry",
  "fish_seafood",
  "green_leafy_vegetables",
  "other_vegetables",
  "fruits",
  "other",
] as const;
export type FoodGroup = (typeof FOOD_GROUPS)[number];

export type FoodFunction = "go" | "grow" | "glow";

export const FOOD_GROUP_FUNCTION: Record<FoodGroup, FoodFunction | null> = {
  cereals_millets: "go",
  roots_tubers: "go",
  fats_oils: "go",
  sugars_sweets: "go",
  pulses_legumes: "grow",
  milk_dairy: "grow",
  nuts_seeds: "grow",
  eggs: "grow",
  meat_poultry: "grow",
  fish_seafood: "grow",
  green_leafy_vegetables: "glow",
  other_vegetables: "glow",
  fruits: "glow",
  other: null,
};

export function isFoodGroup(v: unknown): v is FoodGroup {
  return typeof v === "string" && (FOOD_GROUPS as readonly string[]).includes(v);
}

export const FOOD_GROUP_EXAMPLES: Record<Exclude<FoodGroup, "other">, string> = {
  cereals_millets: "roti, rice, poha, oats, ragi",
  roots_tubers: "potato, sweet potato",
  fats_oils: "oil, ghee, butter",
  sugars_sweets: "sugar, mithai, candy",
  pulses_legumes: "dal, rajma, chana, beans",
  milk_dairy: "milk, curd, paneer",
  nuts_seeds: "almonds, walnuts, peanuts, seeds",
  eggs: "egg",
  meat_poultry: "chicken, mutton",
  fish_seafood: "fish, prawns",
  green_leafy_vegetables: "spinach, methi",
  other_vegetables: "tomato, cauliflower, beans, capsicum",
  fruits: "apple, banana, orange, mango",
};

export interface ReviewItem {
  item: string;
  quantity: Quantity;
  calories: number | null;
  food_group: FoodGroup;
  nutrients: Nutrient[];
  estimationFailed: boolean;
}

// ---------------------------------------------------------------------------
// JSON Schemas for structured output.
// ---------------------------------------------------------------------------
const QUANTITY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { amount: { type: "number" }, unit: { type: "string" } },
  required: ["amount", "unit"],
};

const NUTRIENTS_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      nutrient_type: { type: "string", enum: NUTRIENT_KEYS },
      value: { type: "number" },
      unit: { type: "string", enum: NUTRIENT_UNITS },
    },
    required: ["nutrient_type", "value", "unit"],
  },
};

const ESTIMATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    calories: { type: "number" },
    food_group: { type: "string", enum: FOOD_GROUPS },
    nutrients: NUTRIENTS_SCHEMA,
  },
  required: ["calories", "food_group", "nutrients"],
};

// Extraction + estimation folded into one item — the whole review table comes
// back from a single LLM call (see extractAndEstimate).
const COMBINED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item: { type: "string" },
          quantity: QUANTITY_SCHEMA,
          calories: { type: "number" },
          food_group: { type: "string", enum: FOOD_GROUPS },
          nutrients: NUTRIENTS_SCHEMA,
        },
        required: ["item", "quantity", "calories", "food_group", "nutrients"],
      },
    },
  },
  required: ["items"],
};

// ---------------------------------------------------------------------------
// Prompts.
// ---------------------------------------------------------------------------
// Shared contract for both modalities: the task, the quantity convention, and the
// output shape. Text and image add their own guidance on top (they fail in
// opposite ways — text is exact but vague on amount; a photo needs portion
// estimation and must not invent hidden foods).
const EXTRACTION_SYSTEM_BASE =
  `You identify the distinct food items in a meal for a nutrition-logging app used in India.
Return a list of items, each with an approximate quantity expressed the way food is naturally described — a number plus a unit — rather than forced into grams:
- "amount": a positive number.
- "unit": how it's counted or measured, e.g. "small banana", "medium rotis", "bowl", "glass", "g", "ml", "piece". Use grams/millilitres only when that's how the food is normally measured (e.g. dal, rice, milk).
Split a plate into its distinct dishes.`;

// Typed mode: the user described the meal in their own words.
const EXTRACTION_TEXT_HINT =
  `The input is the person's own words describing what they ate. Trust the quantities they state (e.g. "2 roti" means amount 2). When a quantity is vague ("some rice", "a little dal"), infer a reasonable single-serving amount rather than a large number. Do not add foods they did not mention. If the text names no food, return an empty items array.`;

// Photo mode: infer dishes and portions from the image.
const EXTRACTION_IMAGE_HINT =
  `The input is a photo of a plate. Identify only dishes you can actually see — do not guess at foods that might be hidden or off-frame. Estimate each quantity from visual cues: how full a bowl is, the size of the plate, the number of visible pieces. Tell a main dish apart from a small garnish. If you cannot recognise any food in the photo, return an empty items array — do not invent items.`;

const EXTRACTION_TEXT_SYSTEM = `${EXTRACTION_SYSTEM_BASE}\n${EXTRACTION_TEXT_HINT}`;
const EXTRACTION_IMAGE_SYSTEM = `${EXTRACTION_SYSTEM_BASE}\n${EXTRACTION_IMAGE_HINT}`;

const NUTRIENT_LIST_TEXT = NUTRIENT_SET.map((n) => `${n.key} (${n.unit})`).join(", ");
const FOOD_GROUP_LIST_TEXT = FOOD_GROUPS.filter(
  (g): g is Exclude<FoodGroup, "other"> => g !== "other",
)
  .map((g) => `${g} (e.g. ${FOOD_GROUP_EXAMPLES[g]})`)
  .join("; ");

const ESTIMATION_SYSTEM =
  `You are a nutrition expert for an app used in India. Given one food item and its quantity, estimate its nutritional content for that quantity.
- "calories": total kilocalories for the given quantity (a number).
- "food_group": the single food family this item best belongs to, chosen from exactly one of: ${FOOD_GROUP_LIST_TEXT}. Use "other" only when none fit (e.g. water, tea, a mixed dish that isn't dominated by one family).
- "nutrients": return exactly one entry for every one of these nutrients, using its stated unit, and 0 when the food genuinely contains a negligible amount: ${NUTRIENT_LIST_TEXT}. Values are for the given quantity.
Estimate reasonably; approximate values are expected.`;

// Appended only on the photo path, where the original plate image is provided
// alongside the item so portion size is read from pixels, not just the text.
const ESTIMATION_IMAGE_HINT =
  `A photo of the meal is included. Use it to judge this item's portion size (how full the serving looks, the size and number of pieces) — the text quantity is only an approximate label.`;

// The original plate photo, threaded into per-item estimation on the photo path.
export interface MealImage {
  base64: string;
  mimeType: string;
}

// Combined prompt: identify the items AND estimate each one's nutrition in a
// single call. Reuses the extraction contract + the estimation instructions so
// the output matches the two-stage pipeline, just produced in one round-trip.
const COMBINED_ESTIMATION_INSTRUCTIONS =
  `For every item you list, also estimate its nutrition for the quantity you assigned:
- "calories": total kilocalories for that quantity (a number).
- "food_group": the single food family the item best belongs to, chosen from exactly one of: ${FOOD_GROUP_LIST_TEXT}. Use "other" only when none fit (e.g. water, tea, a mixed dish that isn't dominated by one family).
- "nutrients": exactly one entry for every one of these nutrients, using its stated unit, and 0 when the food genuinely contains a negligible amount: ${NUTRIENT_LIST_TEXT}. Values are for the quantity you assigned.
Estimate reasonably; approximate values are expected.`;

const COMBINED_TEXT_SYSTEM = `${EXTRACTION_TEXT_SYSTEM}\n${COMBINED_ESTIMATION_INSTRUCTIONS}`;
const COMBINED_IMAGE_SYSTEM = `${EXTRACTION_IMAGE_SYSTEM}\n${COMBINED_ESTIMATION_INSTRUCTIONS}\nJudge each portion from the photo (how full the serving looks, the size and number of pieces), not from a default serving size.`;

// Keep only well-formed nutrient rows. Shared by every estimation path.
function normalizeNutrients(raw: unknown): Nutrient[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (n) =>
        n &&
        typeof n.nutrient_type === "string" &&
        Number.isFinite(Number(n.value)) &&
        typeof n.unit === "string",
    )
    .map((n) => ({ nutrient_type: n.nutrient_type, value: Number(n.value), unit: n.unit }));
}

// ---------------------------------------------------------------------------
// Estimation (Stage 2).
// ---------------------------------------------------------------------------
export async function estimateNutrition(
  llm: Llm,
  item: string,
  quantity: Quantity,
  image?: MealImage,
): Promise<{
  calories: number | null;
  food_group: FoodGroup;
  nutrients: Nutrient[];
  estimationFailed: boolean;
}> {
  try {
    // Photo path: prepend the plate image and tell the model to read the portion
    // from it. Text path: text-only, as before.
    const content: ContentBlock[] = [];
    if (image) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: image.mimeType, data: image.base64 },
      });
    }
    content.push({
      type: "text",
      text: `Item: ${item}\nQuantity: ${quantity.amount} ${quantity.unit}`,
    });
    const raw = await llm.generateJson<{
      calories: number;
      food_group: string;
      nutrients: Nutrient[];
    }>({
      system: image ? `${ESTIMATION_SYSTEM}\n${ESTIMATION_IMAGE_HINT}` : ESTIMATION_SYSTEM,
      content,
      schema: ESTIMATION_SCHEMA,
    });
    const calories = Number(raw?.calories);
    return {
      calories: Number.isFinite(calories) ? calories : null,
      food_group: isFoodGroup(raw?.food_group) ? raw.food_group : "other",
      nutrients: normalizeNutrients(raw?.nutrients),
      estimationFailed: false,
    };
  } catch (e) {
    if (e instanceof LlmError && !e.retryable) throw e; // config error: bubble up
    return { calories: null, food_group: "other", nutrients: [], estimationFailed: true };
  }
}

// ---------------------------------------------------------------------------
// Combined extraction + estimation (Stages 1 & 2 in one call).
// ---------------------------------------------------------------------------
interface RawCombinedItem {
  item: string;
  quantity: Quantity;
  calories: number;
  food_group: string;
  nutrients: Nutrient[];
}

function normalizeCombined(raw: { items?: RawCombinedItem[] }): ReviewItem[] {
  if (!Array.isArray(raw?.items)) return [];
  const out: ReviewItem[] = [];
  for (const it of raw.items) {
    const item = typeof it?.item === "string" ? it.item.trim() : "";
    const amount = Number(it?.quantity?.amount);
    const unit = typeof it?.quantity?.unit === "string" ? it.quantity.unit.trim() : "";
    if (!item || !Number.isFinite(amount) || amount <= 0 || !unit) continue;
    const calories = Number(it?.calories);
    out.push({
      item,
      quantity: { amount, unit },
      calories: Number.isFinite(calories) ? calories : null,
      food_group: isFoodGroup(it?.food_group) ? it.food_group : "other",
      nutrients: normalizeNutrients(it?.nutrients),
      // A parsed item missing valid calories = the model skipped its estimate.
      estimationFailed: !Number.isFinite(calories),
    });
  }
  return out;
}

// One LLM call that returns the whole review table: items + per-item nutrition.
// Replaces the extract-then-fan-out-per-item pipeline. On the photo path the
// plate image is sent exactly once (vs once per item before), so the model also
// reasons about portions across the whole plate. Throws LlmError on failure —
// the caller decides how to surface it.
export async function extractAndEstimate(
  llm: Llm,
  input: { text: string } | { image: MealImage },
): Promise<ReviewItem[]> {
  const content: ContentBlock[] = [];
  let system: string;
  if ("image" in input) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: input.image.mimeType, data: input.image.base64 },
    });
    content.push({ type: "text", text: "Identify the food items in this meal and estimate each one's nutrition." });
    system = COMBINED_IMAGE_SYSTEM;
  } else {
    content.push({ type: "text", text: `The user ate: ${input.text}` });
    system = COMBINED_TEXT_SYSTEM;
  }
  const raw = await llm.generateJson<{ items: RawCombinedItem[] }>({
    system,
    content,
    schema: COMBINED_SCHEMA,
  });
  return normalizeCombined(raw);
}

// ---------------------------------------------------------------------------
// Summation (meal totals / day ledger).
// ---------------------------------------------------------------------------
export function sumNutrition(
  items: { calories: number | null; nutrients: Nutrient[] }[],
): { calories: number; nutrients: Nutrient[] } {
  let calories = 0;
  const merged = new Map<string, Nutrient>();
  for (const it of items) {
    if (typeof it.calories === "number" && Number.isFinite(it.calories)) {
      calories += it.calories;
    }
    for (const n of it.nutrients ?? []) {
      const key = `${n.nutrient_type} ${n.unit}`;
      const existing = merged.get(key);
      if (existing) existing.value += n.value;
      else merged.set(key, { ...n });
    }
  }
  calories = Math.round(calories * 10) / 10;
  const nutrients = [...merged.values()].map((n) => ({
    ...n,
    value: Math.round(n.value * 100) / 100,
  }));
  return { calories, nutrients };
}

// ---------------------------------------------------------------------------
// Category defaulting + IST day boundaries.
// ---------------------------------------------------------------------------
export function defaultCategory(now: Date = new Date()): MealCategory {
  const istHour =
    (now.getUTCHours() + 5 + (now.getUTCMinutes() + 30 >= 60 ? 1 : 0)) % 24;
  if (istHour >= 4 && istHour < 11) return "breakfast";
  if (istHour >= 11 && istHour < 16) return "lunch";
  if (istHour >= 16 && istHour < 22) return "dinner";
  return "snacks";
}

// Resolve an IST calendar day to a UTC half-open range [startUtc, endUtc).
export function istDayRange(dateStr?: string): {
  date: string;
  startUtc: string;
  endUtc: string;
} {
  let y: number, m: number, d: number;
  if (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    [y, m, d] = dateStr.split("-").map(Number);
  } else {
    const ist = new Date(Date.now() + (5 * 60 + 30) * 60_000);
    y = ist.getUTCFullYear();
    m = ist.getUTCMonth() + 1;
    d = ist.getUTCDate();
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${y}-${pad(m)}-${pad(d)}`;
  const start = new Date(`${date}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { date, startUtc: start.toISOString(), endUtc: end.toISOString() };
}

// IST day range for an arbitrary instant (used to bucket backdated meals).
export function istDayRangeFor(iso: string) {
  const t = new Date(iso);
  const ist = new Date(t.getTime() + (5 * 60 + 30) * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(
    ist.getUTCDate(),
  )}`;
  return istDayRange(dateStr);
}

// The IST calendar day a UTC instant falls on.
export function istDayKey(utc: Date): string {
  const ist = new Date(utc.getTime() + (5 * 60 + 30) * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`;
}

// ---------------------------------------------------------------------------
// Validation.
// ---------------------------------------------------------------------------
export function isValidCategory(v: unknown): v is MealCategory {
  return typeof v === "string" && (MEAL_CATEGORIES as readonly string[]).includes(v);
}

export interface ItemErrors {
  name?: string;
  quantity?: string;
}

export function validateItem(raw: unknown): {
  ok: boolean;
  errors: ItemErrors;
  value?: {
    name: string;
    quantity: Quantity;
    calories: number | null;
    food_group: FoodGroup;
    nutrients: Nutrient[];
  };
} {
  const errors: ItemErrors = {};
  const r = (raw ?? {}) as Record<string, unknown>;

  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name) errors.name = "Item name is required.";

  const q = (r.quantity ?? {}) as Record<string, unknown>;
  const amount = Number(q.amount);
  const unit = typeof q.unit === "string" && q.unit.trim() ? q.unit.trim() : "serving";
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.quantity = "Quantity must be a positive number.";
  }

  const calories =
    r.calories === null || r.calories === undefined ? null : Number(r.calories);
  const nutrients = Array.isArray(r.nutrients)
    ? (r.nutrients as Nutrient[])
        .filter(
          (n) =>
            n &&
            typeof n.nutrient_type === "string" &&
            Number.isFinite(Number(n.value)) &&
            typeof n.unit === "string",
        )
        .map((n) => ({ nutrient_type: n.nutrient_type, value: Number(n.value), unit: n.unit }))
    : [];

  const ok = Object.keys(errors).length === 0;
  if (!ok) return { ok, errors };
  return {
    ok,
    errors,
    value: {
      name,
      quantity: { amount, unit },
      calories: calories !== null && Number.isFinite(calories) ? calories : null,
      food_group: isFoodGroup(r.food_group) ? r.food_group : "other",
      nutrients,
    },
  };
}
