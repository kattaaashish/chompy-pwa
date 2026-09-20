import { useEffect, useState } from "react";
import { useStore } from "../store";
import { Shell, Mascot, PrimaryButton } from "../components";
import { S } from "../strings";
import { familiesEatenIn } from "../models";
import { MyFood } from "./MyFood";
import { MealDetail } from "./MealDetail";

const CATEGORY_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snack",
};

export function HomeScreen() {
  const s = useStore();
  const [view, setView] = useState<"home" | "myfood">("home");
  const [openMealId, setOpenMealId] = useState<string | null>(null);

  useEffect(() => {
    if (!s.day) void s.refreshDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (view === "myfood") return <MyFood onBack={() => setView("home")} />;

  const meals = s.day?.meals ?? [];

  // Meal detail / edit page. Re-resolve the meal from the latest ledger by id so
  // it reflects saved edits; if it's gone, fall through to Home.
  const openMeal = openMealId ? meals.find((m) => m.id === openMealId) : undefined;
  if (openMeal) return <MealDetail meal={openMeal} onBack={() => setOpenMealId(null)} />;

  const mealCount = meals.length;
  const families = familiesEatenIn(meals).size;

  return (
    <Shell>
      <div className="between">
        <div className="row">
          <Mascot size={52} />
          <div>
            <h1 className="title" style={{ fontSize: 24 }}>
              {S.greeting(s.name)}
            </h1>
          </div>
        </div>
        <button className="btn-text" onClick={() => s.logout()}>
          Sign out
        </button>
      </div>

      <p className="body" style={{ marginTop: 14 }}>
        {S.homeStatus(mealCount)}
      </p>

      <div style={{ marginTop: 18 }}>
        <PrimaryButton onClick={() => s.openLogMeal()}>{S.homeCta}</PrimaryButton>
      </div>

      <button
        className="card between"
        style={{ width: "100%", marginTop: 14, textAlign: "left", border: "none" }}
        onClick={() => setView("myfood")}
      >
        <div>
          <div className="body" style={{ fontWeight: 600 }}>
            {S.myFoodTitle}
          </div>
          <div className="body-sm">{S.myFoodHomeHint(families)}</div>
        </div>
        <span aria-hidden style={{ color: "var(--accent-deep)", fontSize: 20 }}>
          →
        </span>
      </button>

      <section style={{ marginTop: 24 }}>
        <h2 className="title">{S.homeMeals}</h2>
        <div className="stack" style={{ marginTop: 12 }}>
          {mealCount === 0 && (
            <p className="body-sm">{S.mealEmpty}. {S.homeCta}?</p>
          )}
          {meals.map((m, i) => (
            <button
              className="card"
              key={m.id || i}
              onClick={() => setOpenMealId(m.id)}
              style={{ width: "100%", textAlign: "left", border: "none", display: "block" }}
            >
              <div className="between">
                <span className="body" style={{ fontWeight: 600 }}>
                  {CATEGORY_LABEL[m.category] ?? m.category}
                </span>
                <span className="body-sm" style={{ color: "var(--accent-deep)" }}>
                  {m.items.length} foods →
                </span>
              </div>
              <div className="body-sm" style={{ marginTop: 4 }}>
                {m.items.map((it) => it.name).join(", ")}
              </div>
            </button>
          ))}
        </div>
      </section>
    </Shell>
  );
}
