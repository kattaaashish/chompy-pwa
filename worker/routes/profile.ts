// Stage 3 — profile creation. Authenticated. Re-validates every field, saves the
// stable identity fields, and writes the first body measurement.

import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import type { Env, Vars } from "../lib/env";
import { apiError } from "../lib/http";
import { requireAuth } from "../lib/auth";
import { db } from "../db/client";
import { bodyMeasurements, profiles } from "../db/schema";
import { validateProfile } from "../../shared/validation";

export const profile = new Hono<{ Bindings: Env; Variables: Vars }>();

// Read the current profile + latest body measurement, to populate the profile
// view/edit screen.
profile.get("/profile", requireAuth, async (c) => {
  const userId = c.get("userId");
  const database = db(c.env);

  const p = await database
    .select({
      name: profiles.name,
      dateOfBirth: profiles.dateOfBirth,
      gender: profiles.gender,
      phone: profiles.phone,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .get();

  if (!p) return apiError(c, "not_found", "Profile not found.", 404);

  const m = await database
    .select({ heightCm: bodyMeasurements.heightCm, weightKg: bodyMeasurements.weightKg })
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.profileId, userId))
    .orderBy(desc(bodyMeasurements.measuredAt))
    .limit(1)
    .get();

  return c.json({
    name: p.name ?? "",
    dateOfBirth: p.dateOfBirth ?? "",
    gender: p.gender ?? "",
    phone: p.phone ?? "",
    heightCm: m?.heightCm ?? null,
    weightKg: m?.weightKg ?? null,
  });
});

profile.post("/profile", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  const result = validateProfile(body);

  if (!result.ok) {
    return c.json(
      {
        error: {
          code: "validation_failed",
          message: "Some fields need attention.",
          fieldErrors: result.fieldErrors,
        },
      },
      422,
    );
  }

  const v = result.values!;
  const database = db(c.env);

  try {
    await database
      .update(profiles)
      .set({
        name: v.name,
        dateOfBirth: v.dateOfBirth,
        gender: v.gender,
        isProfileComplete: true,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(profiles.id, userId))
      .run();

    await database
      .insert(bodyMeasurements)
      .values({
        id: crypto.randomUUID(),
        profileId: userId,
        heightCm: v.heightCm,
        weightKg: v.weightKg,
      })
      .run();
  } catch (_e) {
    return apiError(c, "server_error", "Couldn't save your profile.", 500, { retryable: true });
  }

  return c.json({ status: "complete", nextStage: "home", warnings: result.warnings });
});
