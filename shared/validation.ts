// Validation + unit conversion for the account-registration flow. Pure — shared
// verbatim with the old Supabase edge functions.

export const MIN_AGE = 5;
export const MAX_AGE = 12;

const PLAUSIBLE_HEIGHT_CM = { min: 90, max: 180 };
const PLAUSIBLE_WEIGHT_KG = { min: 12, max: 90 };

const IN_TO_CM = 2.54;
const LB_TO_KG = 0.45359237;

export function isValidPhone(phone: unknown): phone is string {
  return typeof phone === "string" && /^\d{10}$/.test(phone);
}

export function isValidOtpFormat(code: unknown): code is string {
  return typeof code === "string" && /^\d{6}$/.test(code);
}

export interface ProfileInput {
  name?: unknown;
  dateOfBirth?: unknown;
  gender?: unknown;
  unitSystem?: unknown;
  height?: unknown;
  weight?: unknown;
}

export interface ProfileValidationResult {
  ok: boolean;
  fieldErrors: Record<string, string>;
  warnings: Record<string, string>;
  values?: {
    name: string;
    dateOfBirth: string;
    gender: "male" | "female";
    heightCm: number;
    weightKg: number;
  };
}

function ageFromDob(dob: Date): number {
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

export function validateProfile(input: ProfileInput): ProfileValidationResult {
  const fieldErrors: Record<string, string> = {};
  const warnings: Record<string, string> = {};

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) fieldErrors.name = "Name is required.";

  let dobStr = "";
  const dobRaw = typeof input.dateOfBirth === "string" ? input.dateOfBirth : "";
  const dob = dobRaw ? new Date(`${dobRaw}T00:00:00Z`) : null;
  if (!dob || isNaN(dob.getTime())) {
    fieldErrors.dateOfBirth = "A valid date of birth is required.";
  } else if (dob.getTime() > Date.now()) {
    fieldErrors.dateOfBirth = "Date of birth can't be in the future.";
  } else {
    const age = ageFromDob(dob);
    if (age < MIN_AGE || age > MAX_AGE) {
      fieldErrors.dateOfBirth = `Age must be between ${MIN_AGE} and ${MAX_AGE} years.`;
    } else {
      dobStr = dobRaw;
    }
  }

  const gender = input.gender;
  if (gender !== "male" && gender !== "female") {
    fieldErrors.gender = "Select a gender.";
  }

  const unitSystem = input.unitSystem;
  const metric = unitSystem === "metric";
  const imperial = unitSystem === "imperial";
  if (!metric && !imperial) {
    fieldErrors.unitSystem = "Select a unit system (metric or imperial).";
  }

  const heightRaw = Number(input.height);
  const weightRaw = Number(input.weight);
  let heightCm = NaN;
  let weightKg = NaN;

  if (!Number.isFinite(heightRaw) || heightRaw <= 0) {
    fieldErrors.height = "A valid height is required.";
  } else if (metric || imperial) {
    heightCm = metric ? heightRaw : heightRaw * IN_TO_CM;
    if (heightCm < PLAUSIBLE_HEIGHT_CM.min || heightCm > PLAUSIBLE_HEIGHT_CM.max) {
      warnings.height = "This height looks unusual for the age — double-check it.";
    }
  }

  if (!Number.isFinite(weightRaw) || weightRaw <= 0) {
    fieldErrors.weight = "A valid weight is required.";
  } else if (metric || imperial) {
    weightKg = metric ? weightRaw : weightRaw * LB_TO_KG;
    if (weightKg < PLAUSIBLE_WEIGHT_KG.min || weightKg > PLAUSIBLE_WEIGHT_KG.max) {
      warnings.weight = "This weight looks unusual for the age — double-check it.";
    }
  }

  const ok = Object.keys(fieldErrors).length === 0;
  if (!ok) return { ok, fieldErrors, warnings };

  return {
    ok,
    fieldErrors,
    warnings,
    values: {
      name,
      dateOfBirth: dobStr,
      gender: gender as "male" | "female",
      heightCm: Math.round(heightCm * 10) / 10,
      weightKg: Math.round(weightKg * 10) / 10,
    },
  };
}
