// Load a child's personalized daily requirement from their profile + latest
// weight (energy and protein scale with actual weight; the rest are age/sex
// lookups). Sensible defaults keep it from erroring on an incomplete profile.

import { desc, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { bodyMeasurements, profiles } from "../db/schema";
import {
  ageInYears,
  dailyRequirement,
  type DailyRequirement,
  type Gender,
} from "../../shared/requirements";

export async function loadDailyRequirement(
  db: DB,
  userId: string,
): Promise<DailyRequirement> {
  const profile = await db
    .select({ dateOfBirth: profiles.dateOfBirth, gender: profiles.gender })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .get();

  const measurement = await db
    .select({ weightKg: bodyMeasurements.weightKg })
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.profileId, userId))
    .orderBy(desc(bodyMeasurements.measuredAt))
    .limit(1)
    .get();

  const age = profile?.dateOfBirth ? ageInYears(profile.dateOfBirth) : 7;
  const gender: Gender = profile?.gender === "female" ? "female" : "male";
  const weightKg = measurement?.weightKg != null ? Number(measurement.weightKg) : null;

  return dailyRequirement({ age, gender, weightKg });
}
