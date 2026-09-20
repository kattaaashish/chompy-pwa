// Food logging — extract, re-estimate, save, and the fun fact. Ported from the
// Supabase meal-extract / nutrition-estimate / meal-log / meal-fact functions.
// Photos go to R2; totals are cached on the meal row; save is idempotent via
// client_token (a unique index).

import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { Env, Vars } from "../lib/env";
import { apiError } from "../lib/http";
import { requireAuth } from "../lib/auth";
import { db } from "../db/client";
import { mealItems, meals } from "../db/schema";
import { createLlm, DEFAULT_FAST_MODEL } from "../../shared/llm";
import { LlmError } from "../../shared/llm";
import {
  type FoodGroup,
  type Nutrient,
  buildReviewItem,
  defaultCategory,
  estimateNutrition,
  extractItemsFromImage,
  extractItemsFromText,
  isValidCategory,
  istDayRangeFor,
  sumNutrition,
  validateItem,
} from "../../shared/nutrition";

export const mealRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Strong model: image extraction + all nutrition estimation (quality/vision).
function llmStrong(env: Env) {
  return createLlm(env.ANTHROPIC_API_KEY, env.CHOMPY_LLM_MODEL);
}

// Fast model: text extraction + fun fact (latency-sensitive, no vision needed).
function llmFast(env: Env) {
  return createLlm(env.ANTHROPIC_API_KEY, env.CHOMPY_LLM_MODEL_FAST ?? DEFAULT_FAST_MODEL);
}

function decodeImage(input: string): { base64: string; bytes: Uint8Array } {
  const comma = input.indexOf(",");
  const base64 = input.startsWith("data:") && comma !== -1 ? input.slice(comma + 1) : input;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { base64, bytes };
}

// Stage 1 + 2 — entry (photo/typed) => items => per-item estimation => review table.
mealRoutes.post("/meal/extract", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  const mode = body?.mode;

  let extracted: { item: string; quantity: { amount: number; unit: string } }[] = [];
  let photoPath: string | undefined;
  // On the photo path, the plate image is fed into per-item estimation too, so
  // portions are read from pixels rather than just the extracted text.
  let estimateImage: { base64: string; mimeType: string } | undefined;

  try {
    if (mode === "photo") {
      const image = body?.image;
      const mimeType = body?.mimeType;
      if (typeof image !== "string" || !image) {
        return apiError(c, "validation_failed", "An image is required.", 422);
      }
      if (typeof mimeType !== "string" || !ALLOWED_MIME.has(mimeType)) {
        return apiError(c, "validation_failed", "Image must be JPEG, PNG, or WebP.", 422);
      }

      let base64: string;
      let bytes: Uint8Array;
      try {
        ({ base64, bytes } = decodeImage(image));
      } catch (_e) {
        return apiError(c, "validation_failed", "Image data is invalid.", 422);
      }

      const path = `${userId}/${crypto.randomUUID()}.${MIME_EXT[mimeType]}`;
      try {
        await c.env.PHOTOS.put(path, bytes, { httpMetadata: { contentType: mimeType } });
      } catch (e) {
        console.error(`[meal-extract] upload failed: ${e}`);
        return apiError(c, "server_error", "Couldn't save the photo.", 500, { retryable: true });
      }
      photoPath = path;
      estimateImage = { base64, mimeType };

      // Image extraction → strong (vision) model.
      extracted = await extractItemsFromImage(llmStrong(c.env), base64, mimeType);
    } else if (mode === "text") {
      const text = typeof body?.text === "string" ? body.text.trim() : "";
      if (!text) return apiError(c, "validation_failed", "Enter what you ate.", 422);
      // Text extraction → fast model (low latency), falling back to the strong
      // model. The fast model (Haiku) intermittently draws a 403 on the Workers
      // egress path where the strong model (Opus) is reliable, so this keeps the
      // latency win in the common case without a user-visible failure.
      try {
        extracted = await extractItemsFromText(llmFast(c.env), text);
      } catch (e) {
        if (!(e instanceof LlmError)) throw e;
        console.warn(`[meal-extract] fast model failed, falling back to strong: ${e.message}`);
        extracted = await extractItemsFromText(llmStrong(c.env), text);
      }
    } else {
      return apiError(c, "validation_failed", 'mode must be "photo" or "text".', 422);
    }
  } catch (e) {
    if (e instanceof LlmError) {
      return apiError(c, "server_error", e.message, 500, { retryable: e.retryable });
    }
    console.error(`[meal-extract] ${e}`);
    return apiError(c, "server_error", "Something went wrong.", 500, { retryable: true });
  }

  // Estimation → strong model, always. On the photo path each item also gets the
  // plate image so the portion is judged visually.
  let items;
  try {
    const strong = llmStrong(c.env);
    items = await Promise.all(
      extracted.map((it) => buildReviewItem(strong, it.item, it.quantity, estimateImage)),
    );
  } catch (e) {
    const message = e instanceof LlmError ? e.message : "Something went wrong.";
    return apiError(c, "server_error", message, 500, {
      retryable: e instanceof LlmError ? e.retryable : true,
    });
  }

  return c.json({ items, photoPath, defaultCategory: defaultCategory() });
});

// Stage 2 (re-run) — estimate nutrition for a single added/edited item.
mealRoutes.post("/nutrition/estimate", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));

  const name = typeof body?.item === "string" ? body.item.trim() : "";
  const amount = Number(body?.quantity?.amount);
  const unit =
    typeof body?.quantity?.unit === "string" && body.quantity.unit.trim()
      ? body.quantity.unit.trim()
      : "serving";

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.item = "Item name is required.";
  if (!Number.isFinite(amount) || amount <= 0) {
    fieldErrors.quantity = "Quantity must be a positive number.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json(
      { error: { code: "validation_failed", message: "Check the item and quantity.", fieldErrors } },
      422,
    );
  }

  try {
    // Manual re-estimate (item added/edited in review) — strong model, text-only
    // (no image is available at this point).
    const result = await estimateNutrition(llmStrong(c.env), name, { amount, unit });
    return c.json(result);
  } catch (e) {
    if (e instanceof LlmError) {
      return apiError(c, "server_error", e.message, 500, { retryable: e.retryable });
    }
    console.error(`[nutrition-estimate] ${e}`);
    return apiError(c, "server_error", "Something went wrong.", 500, { retryable: true });
  }
});

interface SavedItem {
  name: string;
  quantity: { amount: number; unit: string };
  calories: number | null;
  food_group: FoodGroup;
  nutrients: Nutrient[];
}

// The day's ledger for the IST day containing loggedAtIso: fetch the profile's
// meals in that range and sum their cached totals. (ISO-Z strings compare
// lexicographically in the same order as the instants they represent.)
async function computeLedger(
  database: ReturnType<typeof db>,
  profileId: string,
  loggedAtIso: string,
) {
  const range = istDayRangeFor(loggedAtIso);
  const rows = await database
    .select({ totalCalories: meals.totalCalories, totalNutrients: meals.totalNutrients, loggedAt: meals.loggedAt })
    .from(meals)
    .where(eq(meals.profileId, profileId))
    .all();
  const dayRows = rows.filter((m) => m.loggedAt >= range.startUtc && m.loggedAt < range.endUtc);
  const totals = sumNutrition(
    dayRows.map((m) => ({ calories: Number(m.totalCalories), nutrients: m.totalNutrients ?? [] })),
  );
  return {
    date: range.date,
    totalCalories: totals.calories,
    totalNutrients: totals.nutrients,
    mealCount: dayRows.length,
  };
}

// Stage 4 — confirm & save. Idempotent via clientToken.
mealRoutes.post("/meal/log", requireAuth, async (c) => {
  const userId = c.get("userId");
  const database = db(c.env);
  const body = await c.req.json().catch(() => ({}));

  const fieldErrors: Record<string, unknown> = {};
  if (!isValidCategory(body?.category)) {
    fieldErrors.category = "Choose breakfast, lunch, dinner, or snacks.";
  }
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  if (rawItems.length === 0) fieldErrors.items = "Add at least one item to log.";

  const values: SavedItem[] = [];
  const itemErrors: { index: number; name?: string; quantity?: string }[] = [];
  rawItems.forEach((raw: unknown, index: number) => {
    const res = validateItem(raw);
    if (!res.ok) itemErrors.push({ index, ...res.errors });
    else values.push(res.value!);
  });
  if (itemErrors.length > 0) fieldErrors.itemErrors = itemErrors;

  if (Object.keys(fieldErrors).length > 0) {
    return c.json(
      {
        error: {
          code: "validation_failed",
          message: "Some items need attention before logging.",
          fieldErrors,
        },
      },
      422,
    );
  }

  const category = body.category as "breakfast" | "lunch" | "dinner" | "snacks";
  const clientToken =
    typeof body?.clientToken === "string" && body.clientToken ? body.clientToken : null;
  const photoPath =
    typeof body?.photoPath === "string" && body.photoPath ? body.photoPath : null;
  const loggedAt =
    typeof body?.loggedAt === "string" && !Number.isNaN(Date.parse(body.loggedAt))
      ? new Date(body.loggedAt).toISOString()
      : new Date().toISOString();

  const totals = sumNutrition(values);
  const mealId = crypto.randomUUID();

  try {
    await database
      .insert(meals)
      .values({
        id: mealId,
        profileId: userId,
        category,
        loggedAt,
        totalCalories: totals.calories,
        totalNutrients: totals.nutrients,
        clientToken,
        photoPath,
      })
      .run();
  } catch (e) {
    // Idempotent retry: this token already produced a meal — return it.
    if (clientToken && String(e).includes("UNIQUE")) {
      const existing = await database
        .select()
        .from(meals)
        .where(and(eq(meals.profileId, userId), eq(meals.clientToken, clientToken)))
        .get();
      if (existing) {
        const its = await database
          .select()
          .from(mealItems)
          .where(eq(mealItems.mealId, existing.id))
          .all();
        const day = await computeLedger(database, userId, existing.loggedAt);
        return c.json({ status: "saved", meal: shapeMeal(existing, its), day });
      }
    }
    console.error(`[meal-log] meal insert failed: ${e}`);
    return apiError(c, "server_error", "Couldn't save the meal.", 500, { retryable: true });
  }

  try {
    await database
      .insert(mealItems)
      .values(
        values.map((v, i) => ({
          id: crypto.randomUUID(),
          mealId,
          name: v.name,
          quantityAmount: v.quantity.amount,
          quantityUnit: v.quantity.unit,
          calories: v.calories,
          nutrients: v.nutrients,
          foodGroup: v.food_group,
          position: i,
        })),
      )
      .run();
  } catch (e) {
    // Compensate: drop the item-less meal so a retry is clean.
    await database.delete(meals).where(eq(meals.id, mealId)).run();
    console.error(`[meal-log] items insert failed: ${e}`);
    return apiError(c, "server_error", "Couldn't save the meal.", 500, { retryable: true });
  }

  const day = await computeLedger(database, userId, loggedAt);
  return c.json({
    status: "saved",
    nextStage: "home",
    meal: {
      id: mealId,
      category,
      logged_at: loggedAt,
      total_calories: totals.calories,
      total_nutrients: totals.nutrients,
      photo_path: photoPath,
      items: values.map((v, i) => ({ ...v, position: i })),
    },
    day,
  });
});

function shapeMeal(
  m: typeof meals.$inferSelect,
  its: (typeof mealItems.$inferSelect)[],
) {
  return {
    id: m.id,
    category: m.category,
    logged_at: m.loggedAt,
    total_calories: m.totalCalories,
    total_nutrients: m.totalNutrients ?? [],
    photo_path: m.photoPath ?? null,
    items: its
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((it) => ({
        name: it.name,
        quantity: { amount: it.quantityAmount, unit: it.quantityUnit },
        calories: it.calories,
        food_group: it.foodGroup ?? "other",
        nutrients: it.nutrients ?? [],
      })),
  };
}

// Edit a saved meal — replace its items (name/quantity + already-estimated
// nutrition) and recompute the cached totals. Authenticated + owner-checked.
// The client re-estimates edited items via /nutrition/estimate before saving,
// so items arrive in the same shape as meal/log.
mealRoutes.post("/meal/update", requireAuth, async (c) => {
  const userId = c.get("userId");
  const database = db(c.env);
  const body = await c.req.json().catch(() => ({}));

  const mealId = typeof body?.mealId === "string" ? body.mealId : "";
  if (!mealId) return apiError(c, "validation_failed", "Which meal?", 422);

  // Ownership: only the meal's owner can edit it.
  const existing = await database
    .select()
    .from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.profileId, userId)))
    .get();
  if (!existing) return apiError(c, "not_found", "Meal not found.", 404);

  // Validate the edited items (same rules as meal/log). Category defaults to the
  // meal's current one if the client didn't send a valid change.
  const category = isValidCategory(body?.category) ? body.category : existing.category;
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  const fieldErrors: Record<string, unknown> = {};
  if (rawItems.length === 0) fieldErrors.items = "A meal needs at least one item.";

  const values: SavedItem[] = [];
  const itemErrors: { index: number; name?: string; quantity?: string }[] = [];
  rawItems.forEach((raw: unknown, index: number) => {
    const res = validateItem(raw);
    if (!res.ok) itemErrors.push({ index, ...res.errors });
    else values.push(res.value!);
  });
  if (itemErrors.length > 0) fieldErrors.itemErrors = itemErrors;
  if (Object.keys(fieldErrors).length > 0) {
    return c.json(
      { error: { code: "validation_failed", message: "Some items need attention.", fieldErrors } },
      422,
    );
  }

  const totals = sumNutrition(values);

  try {
    await database
      .update(meals)
      .set({ category, totalCalories: totals.calories, totalNutrients: totals.nutrients })
      .where(eq(meals.id, mealId))
      .run();
    // Replace the item set wholesale (simplest correct edit).
    await database.delete(mealItems).where(eq(mealItems.mealId, mealId)).run();
    await database
      .insert(mealItems)
      .values(
        values.map((v, i) => ({
          id: crypto.randomUUID(),
          mealId,
          name: v.name,
          quantityAmount: v.quantity.amount,
          quantityUnit: v.quantity.unit,
          calories: v.calories,
          nutrients: v.nutrients,
          foodGroup: v.food_group,
          position: i,
        })),
      )
      .run();
  } catch (e) {
    console.error(`[meal-update] ${e}`);
    return apiError(c, "server_error", "Couldn't update the meal.", 500, { retryable: true });
  }

  const day = await computeLedger(database, userId, existing.loggedAt);
  return c.json({
    status: "updated",
    meal: {
      id: mealId,
      category,
      logged_at: existing.loggedAt,
      total_calories: totals.calories,
      total_nutrients: totals.nutrients,
      items: values.map((v, i) => ({
        name: v.name,
        quantity: v.quantity,
        calories: v.calories,
        food_group: v.food_group,
        nutrients: v.nutrients,
        position: i,
      })),
    },
    day,
  });
});

// Kid-friendly fun fact. Never a hard failure — falls back to a generic fact.
const FACT_SYSTEM =
  `You write one fun food fact for a children's meal-logging app in India. The audience is a young child (about 5-9 years old) who just logged their meal.
Rules:
- Base the fact on the foods in the meal, but keep it playful and surprising — how it grows, what it does in the body, a fun comparison.
- Always positive. If a food is less healthy, do NOT criticise it or warn the child; find an honest positive angle (e.g. energy, taste, where it comes from).
- Never mention calories, nutrients, numbers, weight, or health warnings.
- 1-2 short sentences, simple words a child understands, warm and encouraging tone.
- Return {"fact": "..."} with exactly one fact.`;

const FACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { fact: { type: "string" } },
  required: ["fact"],
};

const FALLBACK_FACT = "Every food does a different job in your body!";

mealRoutes.post("/meal/fact", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  const items = rawItems
    .filter((i: unknown): i is string => typeof i === "string" && i.trim().length > 0)
    .map((i: string) => i.trim())
    .slice(0, 20);

  if (items.length === 0) {
    return apiError(c, "validation_failed", "Add at least one food item.", 422);
  }

  // Fun fact → fast model, falling back to the strong model (same Workers-egress
  // flakiness as extraction), then to a generic fact so the reward screen never
  // breaks.
  const factReq = {
    system: FACT_SYSTEM,
    content: [{ type: "text" as const, text: `The child just ate: ${items.join(", ")}` }],
    schema: FACT_SCHEMA,
    maxTokens: 200,
  };
  try {
    let fact: string;
    try {
      ({ fact } = await llmFast(c.env).generateJson<{ fact: string }>(factReq));
    } catch (e) {
      if (!(e instanceof LlmError)) throw e;
      ({ fact } = await llmStrong(c.env).generateJson<{ fact: string }>(factReq));
    }
    const text = typeof fact === "string" ? fact.trim() : "";
    return c.json({ fact: text || FALLBACK_FACT });
  } catch (e) {
    console.error(`[meal-fact] falling back: ${e instanceof LlmError ? e.message : e}`);
    return c.json({ fact: FALLBACK_FACT });
  }
});

// Serve a meal photo from R2, but only to its owner (path is `${userId}/...`).
mealRoutes.get("/photo/*", requireAuth, async (c) => {
  const userId = c.get("userId");
  const key = c.req.path.replace(/^\/api\/photo\//, "");
  if (!key.startsWith(`${userId}/`)) {
    return apiError(c, "forbidden", "Not your photo.", 403);
  }
  const obj = await c.env.PHOTOS.get(key);
  if (!obj) return apiError(c, "not_found", "Photo not found.", 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  return new Response(obj.body, { headers });
});
