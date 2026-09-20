// Read the current dinner recommendation for the Home card. Returns today's IST
// recommendation if one was generated (by the 7pm cron), else null.

import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { Env, Vars } from "../lib/env";
import { apiError } from "../lib/http";
import { requireAuth } from "../lib/auth";
import { db } from "../db/client";
import { profiles, recommendations } from "../db/schema";
import { istDayRange } from "../../shared/nutrition";
import { generateRecommendation } from "../lib/recommend";

export const recommendation = new Hono<{ Bindings: Env; Variables: Vars }>();

// Manual "suggest now" — runs the same gap-analysis + LLM pipeline for the
// caller and returns the ideas. Requires breakfast + lunch logged today.
recommendation.post("/recommendation/refresh", requireAuth, async (c) => {
  const userId = c.get("userId");
  const profile = await db(c.env)
    .select({
      id: profiles.id,
      name: profiles.name,
      dateOfBirth: profiles.dateOfBirth,
      dietPreference: profiles.dietPreference,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .get();
  if (!profile) return apiError(c, "not_found", "Profile not found.", 404);

  try {
    const result = await generateRecommendation(c.env, profile, { push: false });
    if (result.status === "not_enough_logged") {
      return apiError(
        c,
        "not_enough_logged",
        "Log breakfast and lunch first to get a dinner idea.",
        409,
      );
    }
    return c.json({ items: result.items });
  } catch (e) {
    console.error(`[recommendation:refresh] ${e}`);
    return apiError(c, "server_error", "Couldn't get a suggestion right now.", 500, {
      retryable: true,
    });
  }
});

recommendation.get("/recommendation", requireAuth, async (c) => {
  const userId = c.get("userId");
  const { date } = istDayRange();
  const row = await db(c.env)
    .select({ date: recommendations.date, items: recommendations.items })
    .from(recommendations)
    .where(and(eq(recommendations.profileId, userId), eq(recommendations.date, date)))
    .get();
  return c.json({ date, items: row?.items ?? null });
});
