import { useState } from "react";
import { useStore } from "../store";
import { ApiError } from "../api";
import { Shell, PrimaryButton, ErrorNote } from "../components";
import { S } from "../strings";
import { CATEGORY_KEYS, initialOf, type FoodItem, type LoggedMeal } from "../models";

const CATEGORY_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snack",
};

// Friendly labels for the canonical nutrient keys.
const NUTRIENT_LABEL: Record<string, string> = {
  protein: "Protein",
  carbohydrates: "Carbs",
  fat: "Fat",
  fibre: "Fibre",
  calcium: "Calcium",
  iron: "Iron",
  zinc: "Zinc",
  vitamin_a: "Vitamin A",
  vitamin_c: "Vitamin C",
  vitamin_d: "Vitamin D",
  vitamin_b12: "Vitamin B12",
  folate: "Folate",
  iodine: "Iodine",
  magnesium: "Magnesium",
};
const NUTRIENT_ORDER = Object.keys(NUTRIENT_LABEL);

// Sum a meal's items into calories + per-nutrient {value, unit}.
function mealTotals(items: FoodItem[]) {
  let calories = 0;
  const n = new Map<string, { value: number; unit: string }>();
  for (const it of items) {
    calories += it.calories ?? 0;
    for (const x of it.nutrients) {
      const e = n.get(x.nutrient_type);
      if (e) e.value += x.value;
      else n.set(x.nutrient_type, { value: x.value, unit: x.unit });
    }
  }
  const round = (v: number) => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
  return {
    calories: round(calories),
    nutrients: NUTRIENT_ORDER.filter((k) => n.has(k)).map((k) => ({
      label: NUTRIENT_LABEL[k],
      value: round(n.get(k)!.value),
      unit: n.get(k)!.unit,
    })),
  };
}

export function MealDetail({ meal, onBack }: { meal: LoggedMeal; onBack: () => void }) {
  const s = useStore();
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<FoodItem[]>(meal.items);
  const [category, setCategory] = useState(meal.category);
  const [estimating, setEstimating] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = mealTotals(items);

  const update = (i: number, patch: Partial<FoodItem>) =>
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  // Re-estimate an item whose name/quantity changed (calories cleared to null).
  async function estimate(i: number) {
    const it = items[i];
    if (!it.name.trim() || it.calories != null) return;
    setEstimating(i);
    try {
      const est = await s.estimateItem(it.name.trim(), it.amount, it.unit);
      update(i, {
        calories: est.calories,
        nutrients: est.nutrients,
        foodGroup: est.foodGroup,
        estimationFailed: est.estimationFailed,
      });
    } catch {
      /* leave as-is; it still saves without nutrition */
    } finally {
      setEstimating(null);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Re-estimate any items edited but not yet re-estimated.
      const finalItems = await Promise.all(
        items.map(async (it) => {
          if (it.name.trim() && it.calories == null) {
            try {
              const est = await s.estimateItem(it.name.trim(), it.amount, it.unit);
              return { ...it, ...est };
            } catch {
              return it;
            }
          }
          return it;
        }),
      );
      await s.updateMeal(meal.id, category, finalItems);
      onBack();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save your changes.");
      setSaving(false);
    }
  }

  function cancel() {
    setItems(meal.items);
    setCategory(meal.category);
    setEditing(false);
    setError(null);
  }

  const canSave = items.length > 0 && items.every((it) => it.name.trim());

  return (
    <Shell>
      <div className="between">
        <button className="btn-text" onClick={editing ? cancel : onBack}>
          ← {editing ? "Cancel" : "Home"}
        </button>
        <h1 className="title">{CATEGORY_LABEL[category] ?? category}</h1>
        {!editing ? (
          <button className="btn-text" onClick={() => setEditing(true)}>
            Edit
          </button>
        ) : (
          <span style={{ width: 44 }} />
        )}
      </div>

      {/* Category picker (edit mode only) */}
      {editing && (
        <>
          <p className="field-label" style={{ marginTop: 16 }}>
            {S.reviewWhen}
          </p>
          <div className="chip-row">
            {S.categories.map((label, i) => {
              const key = CATEGORY_KEYS[i];
              return (
                <button
                  key={key}
                  className={`chip ${category === key ? "active" : ""}`}
                  onClick={() => setCategory(key)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Items */}
      <p className="field-label" style={{ marginTop: 20 }}>
        {S.youAte}
      </p>
      <div className="stack">
        {items.map((it, i) => (
          <div className="card" key={i}>
            <div className="row" style={{ alignItems: "center" }}>
              <div className="avatar">{initialOf(it.name)}</div>
              {editing ? (
                <input
                  className="field"
                  style={{ flex: 1, minHeight: 44 }}
                  value={it.name}
                  onChange={(e) => update(i, { name: e.target.value, calories: null })}
                  onBlur={() => estimate(i)}
                />
              ) : (
                <div style={{ flex: 1 }}>
                  <div className="body" style={{ fontWeight: 600 }}>
                    {it.name}
                  </div>
                  <div className="body-sm">
                    {it.amount} {it.unit}
                    {it.calories != null && ` · ${Math.round(it.calories)} kcal`}
                  </div>
                </div>
              )}
              {editing && (
                <button className="btn-text" onClick={() => remove(i)} aria-label="Remove">
                  ✕
                </button>
              )}
            </div>

            {editing && (
              <div className="row" style={{ marginTop: 10 }}>
                <div className="stepper">
                  <button onClick={() => update(i, { amount: Math.max(1, it.amount - 1), calories: null })}>
                    −
                  </button>
                  <span className="val">{it.amount}</span>
                  <button onClick={() => update(i, { amount: it.amount + 1, calories: null })}>+</button>
                </div>
                <input
                  className="field"
                  style={{ flex: 1, minHeight: 44 }}
                  value={it.unit}
                  onChange={(e) => update(i, { unit: e.target.value, calories: null })}
                  onBlur={() => estimate(i)}
                />
              </div>
            )}
            {estimating === i && <p className="body-sm" style={{ marginTop: 6 }}>Chompy is checking…</p>}
          </div>
        ))}
      </div>

      {/* Nutrition (estimated) */}
      <p className="field-label" style={{ marginTop: 22 }}>
        Nutrition (estimated)
      </p>
      <div className="card">
        <div className="between">
          <span className="body" style={{ fontWeight: 700 }}>
            Calories
          </span>
          <span className="body" style={{ fontWeight: 700 }}>
            {totals.calories} kcal
          </span>
        </div>
        {totals.nutrients.length > 0 && <div style={{ height: 8 }} />}
        {totals.nutrients.map((n) => (
          <div className="between" key={n.label} style={{ padding: "3px 0" }}>
            <span className="body-sm">{n.label}</span>
            <span className="body-sm">
              {n.value} {n.unit}
            </span>
          </div>
        ))}
      </div>

      <ErrorNote>{error}</ErrorNote>

      {editing && (
        <>
          <div className="grow" style={{ minHeight: 16 }} />
          <PrimaryButton disabled={!canSave || saving} onClick={save} arrow={false}>
            {saving ? "Saving…" : "Save changes"}
          </PrimaryButton>
        </>
      )}
    </Shell>
  );
}
