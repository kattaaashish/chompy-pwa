// Stage 3 — profile creation. Authenticated. Re-validates every field, saves the
// stable identity fields, and writes the first body measurement.

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Env, Vars } from "../lib/env";
import { apiError } from "../lib/http";
import { requireAuth } from "../lib/auth";
import { db } from "../db/client";
import { bodyMeasurements, profiles } from "../db/schema";
import { validateProfile } from "../../shared/validation";

export const profile = new Hono<{ Bindings: Env; Variables: Vars }>();

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
