// Daily nutrition requirements for a child (ICMR-NIN 2020 RDA, Indian children).
// Pure lookup + light personalization. Same shape as a day's totals so the app
// can compare intake vs requirement field-by-field. The DB read that supplies
// age/sex/weight lives in the Worker (routes/nutrition.ts) and calls
// dailyRequirement() below.

import { Nutrient, NUTRIENT_UNIT, NutrientKey } from "./nutrition";

export type Gender = "male" | "female";

type BracketKey = "4-6" | "7-9" | "10-12:male" | "10-12:female";

interface Bracket {
  refWeightKg: number;
  energyKcal: number;
  nutrients: Partial<Record<NutrientKey, number>>;
}

const WEIGHT_SCALED: ReadonlySet<NutrientKey> = new Set<NutrientKey>(["protein"]);

const RDA: Record<BracketKey, Bracket> = {
  "4-6": {
    refWeightKg: 18.3,
    energyKcal: 1360,
    nutrients: {
      protein: 15.9,
      fibre: 20,
      calcium: 550,
      iron: 11,
      zinc: 4.5,
      magnesium: 125,
      iodine: 90,
      vitamin_a: 510,
      vitamin_c: 35,
      vitamin_d: 15,
      vitamin_b12: 2.2,
      folate: 135,
    },
  },
  "7-9": {
    refWeightKg: 25.3,
    energyKcal: 1700,
    nutrients: {
      protein: 23.3,
      fibre: 26,
      calcium: 650,
      iron: 15,
      zinc: 5.9,
      magnesium: 175,
      iodine: 90,
      vitamin_a: 630,
      vitamin_c: 45,
      vitamin_d: 15,
      vitamin_b12: 2.2,
      folate: 170,
    },
  },
  "10-12:male": {
    refWeightKg: 34.9,
    energyKcal: 2220,
    nutrients: {
      protein: 31.8,
      fibre: 33,
      calcium: 850,
      iron: 16,
      zinc: 8.5,
      magnesium: 240,
      iodine: 100,
      vitamin_a: 770,
      vitamin_c: 55,
      vitamin_d: 15,
      vitamin_b12: 2.2,
      folate: 220,
    },
  },
  "10-12:female": {
    refWeightKg: 36.4,
    energyKcal: 2060,
    nutrients: {
      protein: 32.8,
      fibre: 30,
      calcium: 850,
      iron: 28,
      zinc: 8.5,
      magnesium: 250,
      iodine: 100,
      vitamin_a: 790,
      vitamin_c: 50,
      vitamin_d: 15,
      vitamin_b12: 2.2,
      folate: 225,
    },
  },
};

function bracketFor(age: number, gender: Gender): BracketKey {
  if (age < 7) return "4-6";
  if (age < 10) return "7-9";
  return gender === "female" ? "10-12:female" : "10-12:male";
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface RequirementInput {
  age: number;
  gender: Gender;
  weightKg?: number | null;
}

export interface DailyRequirement {
  calories: number;
  nutrients: Nutrient[];
}

export function dailyRequirement(input: RequirementInput): DailyRequirement {
  const bracket = RDA[bracketFor(input.age, input.gender)];
  const weightKg =
    input.weightKg && input.weightKg > 0 ? input.weightKg : bracket.refWeightKg;

  const calories = Math.round((bracket.energyKcal / bracket.refWeightKg) * weightKg);

  const nutrients: Nutrient[] = [];
  for (const [k, target] of Object.entries(bracket.nutrients)) {
    const key = k as NutrientKey;
    const value = WEIGHT_SCALED.has(key)
      ? (target / bracket.refWeightKg) * weightKg
      : target;
    nutrients.push({ nutrient_type: key, value: round1(value), unit: NUTRIENT_UNIT[key] });
  }

  return { calories, nutrients };
}

// Whole years between a 'YYYY-MM-DD' date of birth and now.
export function ageInYears(dob: string, now: Date = new Date()): number {
  const b = new Date(dob);
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
  return age;
}
