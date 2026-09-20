// D1 (SQLite) schema — Drizzle. Ports the Supabase/Postgres model:
//   • uuid            -> text (crypto.randomUUID() in app code)
//   • timestamptz     -> text (ISO-8601 strings; the IST day logic in
//                        shared/nutrition works on ISO strings unchanged)
//   • jsonb           -> text with { mode: "json" } (nutrient arrays)
//   • numeric         -> real
//   • boolean         -> integer { mode: "boolean" }
//   • RLS             -> app-layer `where(eq(profile_id, userId))` in the Worker
// otp_challenges is gone — OTP now lives in KV (TTL'd), see worker/lib/otp.ts.

import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { Nutrient } from "../../shared/nutrition";

// One row per account (phone-based). Height/weight live in body_measurements.
export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(), // was auth.users.id; now our own uuid
  phone: text("phone").notNull().unique(),
  name: text("name"),
  dateOfBirth: text("date_of_birth"), // 'YYYY-MM-DD'
  gender: text("gender", { enum: ["male", "female"] }),
  // Dietary preference, used to constrain dinner recommendations.
  dietPreference: text("diet_preference", { enum: ["veg", "veg_egg", "nonveg"] })
    .notNull()
    .default("veg"),
  isVerified: integer("is_verified", { mode: "boolean" }).notNull().default(false),
  isProfileComplete: integer("is_profile_complete", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// Time-series of a profile's height/weight. Canonical metric units.
export const bodyMeasurements = sqliteTable(
  "body_measurements",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    heightCm: real("height_cm"),
    weightKg: real("weight_kg"),
    measuredAt: text("measured_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    profileMeasuredIdx: index("body_measurements_profile_measured_idx").on(
      t.profileId,
      t.measuredAt,
    ),
  }),
);

// One row per logged meal. Items live in meal_items; totals cached here.
export const meals = sqliteTable(
  "meals",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    category: text("category", {
      enum: ["breakfast", "lunch", "dinner", "snacks"],
    }).notNull(),
    loggedAt: text("logged_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
    totalCalories: real("total_calories").notNull().default(0),
    totalNutrients: text("total_nutrients", { mode: "json" })
      .notNull()
      .$type<Nutrient[]>()
      .default([]),
    // Idempotency key so a retried save doesn't create a duplicate meal.
    clientToken: text("client_token"),
    // R2 key of the plate photo (photo mode only); null for typed meals.
    photoPath: text("photo_path"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    profileLoggedIdx: index("meals_profile_logged_idx").on(t.profileId, t.loggedAt),
    // NULL client_tokens are distinct in SQLite, so many un-tokened meals coexist;
    // a real token can appear at most once per profile -> idempotent retries.
    clientTokenKey: uniqueIndex("meals_profile_client_token_key").on(
      t.profileId,
      t.clientToken,
    ),
  }),
);

// The daily dinner recommendation (one per profile per IST day). Computed by the
// 7pm cron; shown as a Home card and pushed as a notification.
export const recommendations = sqliteTable(
  "recommendations",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // IST 'YYYY-MM-DD'
    items: text("items", { mode: "json" })
      .notNull()
      .$type<{ item: string; reason: string }[]>()
      .default([]),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    profileDateKey: uniqueIndex("recommendations_profile_date_key").on(t.profileId, t.date),
  }),
);

// Web Push subscriptions for meal-logging reminders. One row per browser/device
// endpoint; re-subscribing upserts on the unique endpoint.
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    profileIdx: index("push_subscriptions_profile_idx").on(t.profileId),
  }),
);

// Confirmed items of a meal. Quantity = positive amount + free-text unit.
export const mealItems = sqliteTable(
  "meal_items",
  {
    id: text("id").primaryKey(),
    mealId: text("meal_id")
      .notNull()
      .references(() => meals.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    quantityAmount: real("quantity_amount").notNull(),
    quantityUnit: text("quantity_unit").notNull(),
    calories: real("calories"), // null when estimation failed for this item
    nutrients: text("nutrients", { mode: "json" })
      .notNull()
      .$type<Nutrient[]>()
      .default([]),
    position: integer("position").notNull().default(0),
    foodGroup: text("food_group"),
    createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  },
  (t) => ({
    mealIdx: index("meal_items_meal_idx").on(t.mealId, t.position),
  }),
);
