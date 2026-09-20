import { useState } from "react";
import { useStore } from "../../store";
import { Shell, PrimaryButton, ErrorNote } from "../../components";
import { S } from "../../strings";
import { CATEGORY_KEYS, initialOf, type FoodItem } from "../../models";

export function ReviewScreen() {
  const s = useStore();
  const items = s.reviewItems;
  const empty = items.length === 0;
  const [estimating, setEstimating] = useState<number | null>(null);

  const update = (i: number, patch: Partial<FoodItem>) =>
    s.setReviewItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => s.setReviewItems(items.filter((_, idx) => idx !== i));
  const add = () =>
    s.setReviewItems([
      ...items,
      { name: "", amount: 1, unit: "piece", calories: null, foodGroup: "other", nutrients: [], estimationFailed: false },
    ]);

  async function estimate(i: number) {
    const it = items[i];
    if (!it.name.trim()) return;
    setEstimating(i);
    try {
      const est = await s.estimateItem(it.name.trim(), it.amount, it.unit);
      update(i, { calories: est.calories, nutrients: est.nutrients, foodGroup: est.foodGroup, estimationFailed: est.estimationFailed });
    } catch {
      /* leave the item as-is; server still logs it without nutrition */
    } finally {
      setEstimating(null);
    }
  }

  const canSave = items.length > 0 && items.every((it) => it.name.trim());

  return (
    <Shell>
      <button className="btn-text" onClick={() => s.openLogMeal()}>
        ← Start over
      </button>
      <h2 className="display" style={{ marginTop: 8 }}>
        {empty ? S.reviewTitleEmpty : S.reviewTitle}
      </h2>
      <p className="body muted" style={{ marginTop: 8 }}>
        {empty ? S.reviewBodyEmpty : S.reviewBody}
      </p>

      {/* When */}
      <p className="field-label" style={{ marginTop: 20 }}>
        {S.reviewWhen}
      </p>
      <div className="chip-row">
        {S.categories.map((label, i) => {
          const key = CATEGORY_KEYS[i];
          return (
            <button
              key={key}
              className={`chip ${s.category === key ? "active" : ""}`}
              onClick={() => s.setCategory(key)}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Items */}
      <p className="field-label" style={{ marginTop: 22 }}>
        {empty ? S.emptyDetectTitle : `${S.reviewFound} ${items.length}`}
      </p>
      {empty && <p className="body-sm">{S.emptyDetectBody}</p>}

      <div className="stack" style={{ marginTop: 8 }}>
        {items.map((it, i) => (
          <div className="card" key={i}>
            <div className="row" style={{ alignItems: "center" }}>
              <div className="avatar">{initialOf(it.name)}</div>
              <input
                className="field"
                style={{ flex: 1, minHeight: 44 }}
                value={it.name}
                placeholder="Food name"
                onChange={(e) => update(i, { name: e.target.value, calories: null })}
                onBlur={() => it.calories == null && estimate(i)}
              />
              <button className="btn-text" onClick={() => remove(i)} aria-label="Remove">
                ✕
              </button>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <div className="stepper">
                <button onClick={() => update(i, { amount: Math.max(1, it.amount - 1), calories: null })}>−</button>
                <span className="val">{it.amount}</span>
                <button onClick={() => update(i, { amount: it.amount + 1, calories: null })}>+</button>
              </div>
              <input
                className="field"
                style={{ flex: 1, minHeight: 44 }}
                value={it.unit}
                onChange={(e) => update(i, { unit: e.target.value, calories: null })}
                onBlur={() => it.calories == null && estimate(i)}
              />
            </div>
            {estimating === i && <p className="body-sm" style={{ marginTop: 6 }}>Chompy is checking…</p>}
          </div>
        ))}
      </div>

      <button className="btn-secondary" style={{ marginTop: 14 }} onClick={add}>
        + {S.reviewAddMissed}
      </button>

      <ErrorNote>{s.busyError}</ErrorNote>
      <p className="body-sm" style={{ marginTop: 12 }}>
        {S.reviewHelper}
      </p>

      <div className="grow" style={{ minHeight: 16 }} />
      <PrimaryButton disabled={!canSave} onClick={() => s.confirmSave()}>
        {empty ? S.reviewCtaEmpty : S.reviewCta}
      </PrimaryButton>
    </Shell>
  );
}
