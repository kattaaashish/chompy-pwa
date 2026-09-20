import { useEffect, useState } from "react";
import { useStore } from "../store";
import { Shell, Mascot, PrimaryButton } from "../components";
import { S } from "../strings";
import {
  aggregateItems,
  CATEGORY_KEYS,
  CATEGORY_LABEL,
  familiesEatenIn,
  type FoodItem,
  type LoggedMeal,
} from "../models";
import { MyFood } from "./MyFood";
import { MealDetail } from "./MealDetail";

// The macros shown in each meal's collapsed summary line.
const SUMMARY_MACROS = ["protein", "carbohydrates", "fat"];

export function HomeScreen() {
  const s = useStore();
  const [view, setView] = useState<"home" | "myfood">("home");
  const [openMealId, setOpenMealId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  // Combine the day's meals by category (breakfast/lunch/dinner/snacks). A
  // category can hold more than one logged meal; we sum them for the summary and
  // list each meal's items when expanded.
  const byCategory = CATEGORY_KEYS.map((cat) => ({
    cat,
    meals: meals.filter((m) => m.category === cat),
  })).filter((g) => g.meals.length > 0);

  const toggle = (cat: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });

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
            <p className="body-sm">
              {S.mealEmpty}. {S.homeCta}?
            </p>
          )}
          {byCategory.map(({ cat, meals: catMeals }) => (
            <MealGroup
              key={cat}
              category={cat}
              meals={catMeals}
              open={expanded.has(cat)}
              onToggle={() => toggle(cat)}
              onEdit={(id) => setOpenMealId(id)}
            />
          ))}
        </div>
      </section>
    </Shell>
  );
}

function MealGroup({
  category,
  meals,
  open,
  onToggle,
  onEdit,
}: {
  category: string;
  meals: LoggedMeal[];
  open: boolean;
  onToggle: () => void;
  onEdit: (mealId: string) => void;
}) {
  const allItems = meals.flatMap((m) => m.items);
  const totals = aggregateItems(allItems);
  const macros = SUMMARY_MACROS.map((k) => totals.nutrients.find((n) => n.key === k)).filter(
    (n): n is NonNullable<typeof n> => Boolean(n),
  );

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Collapsed header — tap to expand */}
      <button
        onClick={onToggle}
        style={{ width: "100%", textAlign: "left", border: "none", background: "transparent", padding: 16 }}
      >
        <div className="between">
          <span className="body" style={{ fontWeight: 700 }}>
            {CATEGORY_LABEL[category] ?? category}
          </span>
          <span className="row" style={{ gap: 8 }}>
            <span className="body" style={{ fontWeight: 700 }}>
              {totals.calories} kcal
            </span>
            <span aria-hidden style={{ color: "var(--neutral-600)" }}>
              {open ? "▾" : "▸"}
            </span>
          </span>
        </div>
        <div className="body-sm" style={{ marginTop: 4 }}>
          {allItems.length} {allItems.length === 1 ? "food" : "foods"}
          {macros.length > 0 && "  ·  "}
          {macros.map((m) => `${m.label} ${m.value}${m.unit}`).join(" · ")}
        </div>
      </button>

      {/* Expanded — itemized, grouped by the underlying meal so edits map to it */}
      {open && (
        <div style={{ padding: "0 16px 12px" }}>
          {meals.map((m, mi) => (
            <div key={m.id || mi} style={{ marginTop: mi === 0 ? 0 : 12 }}>
              {meals.length > 1 && (
                <div className="field-label" style={{ margin: "0 0 6px" }}>
                  Logged {ordinal(mi + 1)}
                </div>
              )}
              {m.items.map((it, i) => (
                <ItemRow key={i} item={it} />
              ))}
              <button
                className="btn-text"
                style={{ padding: "6px 0" }}
                onClick={() => onEdit(m.id)}
              >
                Edit →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemRow({ item }: { item: FoodItem }) {
  return (
    <div className="between" style={{ padding: "6px 0", borderTop: "1px solid var(--neutral-200)" }}>
      <span className="body-sm">
        {item.name} <span className="muted">· {item.amount} {item.unit}</span>
      </span>
      {item.calories != null && (
        <span className="body-sm muted">{Math.round(item.calories)} kcal</span>
      )}
    </div>
  );
}

const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
