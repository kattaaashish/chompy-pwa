// Thin client over the Worker API (/api/*). Turns the backend's structured error
// envelope into a typed ApiError the UI can branch on (wrong vs expired code,
// per-field validation). Auth is a Bearer JWT held by the store.

import type { DailyNeeds, DayLedger, FoodItem } from "./models";
import { parseDay, parseNeeds } from "./models";

export class ApiError extends Error {
  code: string;
  retryable: boolean;
  fieldErrors: Record<string, string>;
  constructor(
    code: string,
    message: string,
    retryable = false,
    fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.fieldErrors = fieldErrors;
  }
  static network() {
    return new ApiError("network", "Could not reach Chompy. Check your connection.", true);
  }
}

const BASE = "/api";

async function postOnce<T = any>(
  path: string,
  body: unknown,
  token?: string | null,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw ApiError.network();
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new ApiError("server_error", "Something went wrong. Please try again.", true);
  }

  if (json?.error) {
    const e = json.error;
    throw new ApiError(
      e.code ?? "server_error",
      e.message ?? "Something went wrong.",
      Boolean(e.retryable),
      e.fieldErrors ?? {},
    );
  }
  return json as T;
}

// Retry retryable failures on a FRESH request. The Workers→Anthropic egress
// occasionally draws a transient 403 that's correlated within a single Worker
// invocation, so a new request (new isolate/egress IP) usually succeeds where an
// in-invocation retry can't. Only used for the idempotent LLM-backed calls.
async function post<T = any>(
  path: string,
  body: unknown,
  token?: string | null,
  retries = 0,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await postOnce<T>(path, body, token);
    } catch (e) {
      const retryable = e instanceof ApiError && e.retryable;
      if (!retryable || attempt >= retries) throw e;
      attempt++;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

export interface VerifyResult {
  nextStage: string;
  accessToken: string;
}

export interface ExtractResult {
  items: FoodItem[];
  defaultCategory: string;
  photoPath?: string;
}

export const api = {
  async requestOtp(phone: string): Promise<string | null> {
    const j = await post("/auth/request-otp", { phone });
    return (j.debugCode as string) ?? null;
  },

  async verifyOtp(phone: string, code: string): Promise<VerifyResult> {
    const j = await post("/auth/verify-otp", { phone, code });
    return { nextStage: j.nextStage, accessToken: j.session.access_token };
  },

  async sessionState(token: string): Promise<string> {
    const j = await post("/session-state", {}, token);
    return j.stage as string;
  },

  async getProfile(token: string): Promise<{
    name: string;
    dateOfBirth: string;
    gender: string;
    phone: string;
    heightCm: number | null;
    weightKg: number | null;
  }> {
    const res = await fetch("/api/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new ApiError("server_error", "Couldn't load your profile.", true);
    return await res.json();
  },

  async upsertProfile(
    token: string,
    p: {
      name: string;
      dateOfBirth: string;
      gender: "male" | "female";
      heightCm: number;
      weightKg: number;
    },
  ): Promise<Record<string, string>> {
    const j = await post(
      "/profile",
      {
        name: p.name,
        dateOfBirth: p.dateOfBirth,
        gender: p.gender,
        unitSystem: "metric",
        height: p.heightCm,
        weight: p.weightKg,
      },
      token,
    );
    return (j.warnings as Record<string, string>) ?? {};
  },

  async mealExtractText(token: string, text: string): Promise<ExtractResult> {
    const j = await post("/meal/extract", { mode: "text", text }, token, 3);
    return {
      items: (j.items ?? []).map(itemFromExtract),
      defaultCategory: j.defaultCategory ?? "snacks",
      photoPath: j.photoPath,
    };
  },

  async mealExtractPhoto(
    token: string,
    base64Image: string,
    mimeType: string,
  ): Promise<ExtractResult> {
    const j = await post(
      "/meal/extract",
      { mode: "photo", image: base64Image, mimeType },
      token,
      3,
    );
    return {
      items: (j.items ?? []).map(itemFromExtract),
      defaultCategory: j.defaultCategory ?? "snacks",
      photoPath: j.photoPath,
    };
  },

  async nutritionEstimate(
    token: string,
    name: string,
    amount: number,
    unit: string,
  ): Promise<FoodItem> {
    const j = await post("/nutrition/estimate", { item: name, quantity: { amount, unit } }, token, 3);
    return {
      name,
      amount,
      unit,
      calories: j.calories ?? null,
      foodGroup: j.food_group ?? "other",
      nutrients: j.nutrients ?? [],
      estimationFailed: Boolean(j.estimationFailed),
    };
  },

  async nutritionDay(token: string): Promise<DayLedger> {
    const j = await post("/nutrition/day", {}, token);
    return parseDay(j);
  },

  async nutritionWeek(token: string): Promise<{ days: DayLedger[]; needs: DailyNeeds | null }> {
    const j = await post("/nutrition/week", {}, token);
    return {
      days: (j.days ?? []).map(parseDay),
      needs: j.requirement ? parseNeeds(j.requirement) : null,
    };
  },

  async mealFact(token: string, items: FoodItem[]): Promise<string> {
    const j = await post(
      "/meal/fact",
      { items: items.map((i) => `${i.name} ${i.amount} ${i.unit}`.trim()) },
      token,
      2,
    );
    return (j.fact as string) ?? "";
  },

  async mealUpdate(
    token: string,
    mealId: string,
    category: string,
    items: FoodItem[],
  ): Promise<void> {
    await post(
      "/meal/update",
      {
        mealId,
        category,
        items: items.map((i) => ({
          name: i.name,
          quantity: { amount: i.amount, unit: i.unit },
          calories: i.calories,
          food_group: i.foodGroup,
          nutrients: i.nutrients,
        })),
      },
      token,
    );
  },

  async mealLog(
    token: string,
    category: string,
    items: FoodItem[],
    clientToken: string,
    photoPath?: string | null,
  ): Promise<void> {
    await post(
      "/meal/log",
      {
        category,
        items: items.map((i) => ({
          name: i.name,
          quantity: { amount: i.amount, unit: i.unit },
          calories: i.calories,
          food_group: i.foodGroup,
          nutrients: i.nutrients,
        })),
        clientToken,
        photoPath: photoPath ?? null,
      },
      token,
    );
  },

  // Fetch a meal photo (owner-only endpoint needs the bearer token, so <img>
  // can't load it directly) and return an object URL for display.
  async fetchPhoto(token: string, photoPath: string): Promise<string> {
    const res = await fetch(`/api/photo/${photoPath}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`photo ${res.status}`);
    return URL.createObjectURL(await res.blob());
  },
};

function itemFromExtract(j: any): FoodItem {
  const q = j.quantity ?? {};
  return {
    name: j.item ?? "",
    amount: q.amount ?? 1,
    unit: q.unit ?? "serving",
    calories: j.calories ?? null,
    foodGroup: j.food_group ?? "other",
    nutrients: j.nutrients ?? [],
    estimationFailed: Boolean(j.estimationFailed),
  };
}
