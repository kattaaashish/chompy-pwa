// Central store — the onboarding + food-logging state machines from the Flutter
// app (lib/state/*, lib/main.dart), as one reducer + async actions over context.

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { api, ApiError } from "./api";
import type { DayLedger, FoodItem } from "./models";

export type Screen =
  | "restoring"
  | "welcome"
  | "phone"
  | "sending"
  | "otp"
  | "verifying"
  | "profile"
  | "home";

export type FoodScreen =
  | "none"
  | "mode"
  | "cancelled"
  | "text"
  | "detecting"
  | "review"
  | "saving"
  | "fact"
  | "saved"
  | "failed";

export type OtpError = "wrong" | "expired" | null;

interface State {
  screen: Screen;
  token: string | null;
  name: string;
  phone: string;
  debugCode: string | null;
  otpError: OtpError;
  busyError: string | null;

  food: FoodScreen;
  reviewItems: FoodItem[];
  photoPath: string | null; // R2 key of the plate photo for the in-progress meal
  category: string; // lowercase backend category
  extractedCount: number;
  savedCategory: string;
  savedCount: number;
  fact: string;

  day: DayLedger | null;
  dayLoading: boolean;
}

const TOKEN_KEY = "chompy_token";

const initial: State = {
  screen: "restoring",
  token: localStorage.getItem(TOKEN_KEY),
  name: "",
  phone: "",
  debugCode: null,
  otpError: null,
  busyError: null,
  food: "none",
  reviewItems: [],
  photoPath: null,
  category: "snacks",
  extractedCount: 0,
  savedCategory: "",
  savedCount: 0,
  fact: "",
  day: null,
  dayLoading: false,
};

type Action = { type: "set"; patch: Partial<State> };

function reducer(state: State, action: Action): State {
  return { ...state, ...action.patch };
}

interface Store extends State {
  // onboarding
  restore: () => Promise<void>;
  startPhone: () => void;
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
  changeNumber: () => void;
  submitProfile: (p: {
    name: string;
    dateOfBirth: string;
    gender: "male" | "female";
    heightCm: number;
    weightKg: number;
  }) => Promise<Record<string, string>>;
  refreshDay: () => Promise<void>;
  logout: () => void;
  // food flow
  openLogMeal: () => void;
  chooseType: () => void;
  submitText: (text: string) => Promise<void>;
  submitPhoto: (base64: string, mime: string) => Promise<void>;
  cancelPhoto: () => void;
  setReviewItems: (items: FoodItem[]) => void;
  setCategory: (cat: string) => void;
  estimateItem: (name: string, amount: number, unit: string) => Promise<FoodItem>;
  updateMeal: (mealId: string, category: string, items: FoodItem[]) => Promise<void>;
  saveProfile: (p: {
    name: string;
    dateOfBirth: string;
    gender: "male" | "female";
    heightCm: number;
    weightKg: number;
  }) => Promise<Record<string, string>>;
  confirmSave: () => Promise<void>;
  retrySave: () => Promise<void>;
  showSaved: () => void;
  backHome: () => void;
  exitFood: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const set = (patch: Partial<State>) => dispatch({ type: "set", patch });

  // Idempotency key for the in-flight save — survives re-renders so a retried
  // save reuses the same clientToken (server dedupes on it).
  const saveTokenRef = useRef<string | null>(null);

  // A stable ref to the current token so async actions read the latest value.
  const store = useMemo<Store>(() => {
    // Read token live from localStorage to avoid stale closures.
    const tok = () => localStorage.getItem(TOKEN_KEY);
    const saveToken = (t: string) => {
      localStorage.setItem(TOKEN_KEY, t);
      set({ token: t });
    };

    const loadDay = async () => {
      const t = tok();
      if (!t) return;
      set({ dayLoading: true });
      try {
        const day = await api.nutritionDay(t);
        set({ day, name: state.name, dayLoading: false });
      } catch {
        set({ dayLoading: false });
      }
    };

    return {
      ...state,

      async restore() {
        const t = tok();
        if (!t) {
          set({ screen: "welcome" });
          return;
        }
        try {
          const stage = await api.sessionState(t);
          if (stage === "home") {
            set({ screen: "home" });
            void loadDay();
          } else if (stage === "profile") {
            set({ screen: "profile" });
          } else {
            set({ screen: "phone" });
          }
        } catch {
          set({ screen: "welcome" });
        }
      },

      startPhone() {
        set({ screen: "phone", otpError: null, busyError: null });
      },

      async sendOtp(phone: string) {
        set({ screen: "sending", phone, busyError: null });
        try {
          const debugCode = await api.requestOtp(phone);
          set({ screen: "otp", debugCode, otpError: null });
        } catch (e) {
          const msg = e instanceof ApiError ? e.message : "Something went wrong.";
          set({ screen: "phone", busyError: msg });
        }
      },

      async verifyOtp(code: string) {
        set({ screen: "verifying", otpError: null });
        try {
          const res = await api.verifyOtp(state.phone, code);
          saveToken(res.accessToken);
          if (res.nextStage === "home") {
            set({ screen: "home" });
            void loadDay();
          } else {
            set({ screen: "profile" });
          }
        } catch (e) {
          if (e instanceof ApiError && e.code === "code_expired") {
            set({ screen: "otp", otpError: "expired" });
          } else {
            set({ screen: "otp", otpError: "wrong" });
          }
        }
      },

      changeNumber() {
        set({ screen: "phone", otpError: null, debugCode: null });
      },

      async submitProfile(p) {
        const t = tok();
        if (!t) throw ApiError.network();
        const warnings = await api.upsertProfile(t, p);
        set({ screen: "home", name: p.name });
        void loadDay();
        return warnings;
      },

      async refreshDay() {
        await loadDay();
      },

      logout() {
        localStorage.removeItem(TOKEN_KEY);
        set({ token: null, screen: "welcome", day: null, name: "" });
      },

      // ── Food flow ──
      openLogMeal() {
        saveTokenRef.current = null; // fresh meal -> fresh idempotency key
        set({ food: "mode", reviewItems: [], photoPath: null, busyError: null });
      },
      chooseType() {
        set({ food: "text" });
      },
      async submitText(text: string) {
        const t = tok();
        if (!t) return;
        set({ food: "detecting" });
        try {
          const r = await api.mealExtractText(t, text);
          set({
            food: "review",
            reviewItems: r.items,
            photoPath: null, // typed meal: no photo
            category: r.defaultCategory,
            extractedCount: r.items.length,
          });
        } catch (e) {
          const msg = e instanceof ApiError ? e.message : "Something went wrong.";
          set({ food: "text", busyError: msg });
        }
      },
      async submitPhoto(base64: string, mime: string) {
        const t = tok();
        if (!t) return;
        set({ food: "detecting" });
        try {
          const r = await api.mealExtractPhoto(t, base64, mime);
          set({
            food: "review",
            reviewItems: r.items,
            photoPath: r.photoPath ?? null,
            category: r.defaultCategory,
            extractedCount: r.items.length,
          });
        } catch (e) {
          const msg = e instanceof ApiError ? e.message : "Something went wrong.";
          set({ food: "cancelled", busyError: msg });
        }
      },
      cancelPhoto() {
        set({ food: "cancelled" });
      },
      setReviewItems(items: FoodItem[]) {
        set({ reviewItems: items });
      },
      setCategory(cat: string) {
        set({ category: cat });
      },
      async estimateItem(name: string, amount: number, unit: string) {
        const t = tok();
        if (!t) throw ApiError.network();
        return await api.nutritionEstimate(t, name, amount, unit);
      },
      async updateMeal(mealId: string, category: string, items: FoodItem[]) {
        const t = tok();
        if (!t) throw ApiError.network();
        await api.mealUpdate(t, mealId, category, items);
        await loadDay(); // refresh the ledger so Home reflects the edit
      },
      async saveProfile(p) {
        const t = tok();
        if (!t) throw ApiError.network();
        const warnings = await api.upsertProfile(t, p);
        set({ name: p.name }); // keep the greeting in sync
        await loadDay(); // requirement depends on age/weight
        return warnings;
      },
      async confirmSave() {
        const t = tok();
        if (!t) return;
        saveTokenRef.current = saveTokenRef.current ?? crypto.randomUUID();
        set({ food: "saving" });
        try {
          await api.mealLog(
            t,
            state.category,
            state.reviewItems,
            saveTokenRef.current,
            state.photoPath,
          );
          // Fun fact (never a hard failure).
          let fact = "";
          try {
            fact = await api.mealFact(t, state.reviewItems);
          } catch {
            fact = "";
          }
          set({
            food: "fact",
            fact,
            savedCategory: state.category,
            savedCount: state.reviewItems.length,
          });
          saveTokenRef.current = null;
          void loadDay();
        } catch (e) {
          const msg = e instanceof ApiError ? e.message : "Something went wrong.";
          set({ food: "failed", busyError: msg });
        }
      },
      async retrySave() {
        await this.confirmSave();
      },
      showSaved() {
        set({ food: "saved" });
      },
      backHome() {
        set({ food: "none", reviewItems: [] });
        void loadDay();
      },
      exitFood() {
        set({ food: "none", reviewItems: [] });
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}
