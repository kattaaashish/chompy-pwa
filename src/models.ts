// Frontend models + derivations, ported from lib/models/food.dart and
// lib/models/my_food.dart. Family coverage and nutrient totals are DERIVED from a
// day's meals so the meal list, family cards, and bars can never disagree.

import { S } from "./strings";

export interface Nutrient {
  nutrient_type: string;
  value: number;
  unit: string;
}

export interface FoodItem {
  name: string;
  amount: number;
  unit: string;
  calories: number | null;
  foodGroup: string;
  nutrients: Nutrient[];
  estimationFailed: boolean;
}

export interface LoggedMeal {
  id: string; // meal id — needed to edit a saved meal
  category: string; // breakfast | lunch | dinner | snacks
  items: FoodItem[];
}

export interface DailyNeeds {
  calories: number;
  nutrients: Record<string, number>; // nutrient_type -> target
}

export interface DayLedger {
  date: string;
  meals: LoggedMeal[];
  needs: DailyNeeds | null;
}

// The five families the My food screen rolls items into (coarser than the 13
// backend groups). fats_oils, sugars_sweets, other belong to none.
export type FoodFamily = "grain" | "protein" | "veg" | "fruit" | "dairy";
export const familyOrder: FoodFamily[] = ["grain", "protein", "veg", "fruit", "dairy"];

export function familyForGroup(group: string): FoodFamily | null {
  switch (group) {
    case "cereals_millets":
    case "roots_tubers":
    case "grains_cereals":
      return "grain";
    case "pulses_legumes":
    case "eggs":
    case "meat_poultry":
    case "fish_seafood":
    case "nuts_seeds":
    case "egg_meat_fish":
      return "protein";
    case "green_leafy_vegetables":
    case "other_vegetables":
    case "vegetables":
      return "veg";
    case "fruits":
      return "fruit";
    case "milk_dairy":
      return "dairy";
    default:
      return null;
  }
}

export function familiesEatenIn(meals: LoggedMeal[]): Set<FoodFamily> {
  const s = new Set<FoodFamily>();
  for (const m of meals)
    for (const i of m.items) {
      const f = familyForGroup(i.foodGroup);
      if (f) s.add(f);
    }
  return s;
}

// ── Nutrient bars ──────────────────────────────────────────────────────────
export interface NutrientDef {
  label: string;
  unit: string;
  backendType?: string;
  isCalories?: boolean;
  fixedTarget?: number; // Carbs/Fat have no RDA; design still shows them.
}

export const displayNutrients: NutrientDef[] = [
  { label: S.nutrientLabels[0], unit: "kcal", isCalories: true },
  { label: S.nutrientLabels[1], unit: "g", backendType: "protein" },
  { label: S.nutrientLabels[2], unit: "g", backendType: "carbohydrates", fixedTarget: 230 },
  { label: S.nutrientLabels[3], unit: "g", backendType: "fat", fixedTarget: 45 },
  { label: S.nutrientLabels[4], unit: "g", backendType: "fibre" },
  { label: S.nutrientLabels[5], unit: "mg", backendType: "calcium" },
  { label: S.nutrientLabels[6], unit: "mg", backendType: "iron" },
  { label: S.nutrientLabels[7], unit: "µg", backendType: "vitamin_a" },
  { label: S.nutrientLabels[8], unit: "mg", backendType: "vitamin_c" },
];

export interface DayTotals {
  calories: number;
  nutrients: Record<string, number>;
}

export function totalsFromMeals(meals: LoggedMeal[]): DayTotals {
  let calories = 0;
  const nutrients: Record<string, number> = {};
  for (const m of meals)
    for (const i of m.items) {
      calories += i.calories ?? 0;
      for (const n of i.nutrients)
        nutrients[n.nutrient_type] = (nutrients[n.nutrient_type] ?? 0) + n.value;
    }
  return { calories, nutrients };
}

export function averageTotals(days: DayTotals[]): DayTotals {
  if (days.length === 0) return { calories: 0, nutrients: {} };
  const nutrients: Record<string, number> = {};
  let calories = 0;
  for (const d of days) {
    calories += d.calories;
    for (const k in d.nutrients) nutrients[k] = (nutrients[k] ?? 0) + d.nutrients[k];
  }
  const n = days.length;
  const avg: Record<string, number> = {};
  for (const k in nutrients) avg[k] = nutrients[k] / n;
  return { calories: calories / n, nutrients: avg };
}

function got(totals: DayTotals, d: NutrientDef): number {
  return d.isCalories ? totals.calories : totals.nutrients[d.backendType ?? ""] ?? 0;
}

export interface NutrientRow {
  def: NutrientDef;
  got: number;
  target: number | null;
  fraction: number;
  percent: number;
  valueLabel: string;
  targetLabel: string | null;
}

const fmt = (v: number) => (v >= 100 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString());

export function nutrientRows(totals: DayTotals, needs: DailyNeeds | null): NutrientRow[] {
  return displayNutrients.map((d) => {
    let target: number | null;
    if (needs) {
      target = d.isCalories
        ? needs.calories
        : needs.nutrients[d.backendType ?? ""] ?? d.fixedTarget ?? null;
    } else {
      target = d.fixedTarget ?? null;
    }
    const g = got(totals, d);
    const fraction = target && target > 0 ? Math.min(g / target, 1) : 0;
    return {
      def: d,
      got: g,
      target,
      fraction,
      percent: Math.round(fraction * 100),
      valueLabel: `${fmt(g)} ${d.unit}`,
      targetLabel: target === null ? null : `${fmt(target)} ${d.unit}`,
    };
  });
}

// ── Parsers (API JSON -> models) ─────────────────────────────────────────────
export function parseNeeds(j: any): DailyNeeds {
  const nutrients: Record<string, number> = {};
  for (const n of j.nutrients ?? []) nutrients[n.nutrient_type] = n.value ?? 0;
  return { calories: j.calories ?? 0, nutrients };
}

export function parseDay(j: any): DayLedger {
  return {
    date: j.date ?? "",
    needs: j.requirement ? parseNeeds(j.requirement) : null,
    meals: (j.meals ?? []).map((m: any) => ({
      id: m.id ?? "",
      category: m.category ?? "",
      items: (m.items ?? []).map((i: any) => ({
        name: i.name ?? "",
        amount: i.quantity?.amount ?? 0,
        unit: i.quantity?.unit ?? "",
        calories: i.calories ?? null,
        foodGroup: i.food_group ?? "other",
        nutrients: i.nutrients ?? [],
        estimationFailed: false,
      })),
    })),
  };
}

export const CATEGORY_KEYS = ["breakfast", "lunch", "dinner", "snacks"] as const;
export const initialOf = (name: string) =>
  name.trim() ? name.trim()[0].toUpperCase() : "?";
