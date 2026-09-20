import { useEffect, useState } from "react";
import { useStore } from "../store";
import { api } from "../api";
import { S } from "../strings";
import {
  type DayLedger,
  type DailyNeeds,
  type FoodFamily,
  familiesEatenIn,
  familyOrder,
  totalsFromMeals,
  averageTotals,
  nutrientRows,
  type NutrientRow,
} from "../models";

const FAMILY_INDEX: Record<FoodFamily, number> = {
  grain: 0,
  protein: 1,
  veg: 2,
  fruit: 3,
  dairy: 4,
};

export function MyFood({ onBack }: { onBack: () => void }) {
  const s = useStore();
  const [tab, setTab] = useState<"today" | "week">("today");
  const [week, setWeek] = useState<{ days: DayLedger[]; needs: DailyNeeds | null } | null>(null);

  useEffect(() => {
    if (tab === "week" && !week && s.token) {
      api.nutritionWeek(s.token).then(setWeek).catch(() => setWeek({ days: [], needs: null }));
    }
  }, [tab, week, s.token]);

  const day = s.day;
  const todayMeals = day?.meals ?? [];
  const eaten = familiesEatenIn(todayMeals);

  return (
    <div className="shell fade-in">
      <div className="between">
        <button className="btn-text" onClick={onBack}>
          ← Home
        </button>
        <h1 className="title">{S.myFoodTitle}</h1>
        <span style={{ width: 44 }} />
      </div>

      <div className="tabs" style={{ marginTop: 12 }}>
        <button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}>
          {S.tabToday}
        </button>
        <button className={tab === "week" ? "active" : ""} onClick={() => setTab("week")}>
          {S.tabWeek}
        </button>
      </div>

      {tab === "today" ? (
        <>
          <FamilySection
            title={S.familiesLabel}
            line={S.familiesLineToday(eaten.size)}
            renderStatus={(f) => (eaten.has(f) ? { label: S.familyEaten, strong: true } : null)}
          />
          <NutrientSection
            title={S.nutritionToday}
            explainer={S.nutritionTodayExplainer}
            rows={nutrientRows(totalsFromMeals(todayMeals), day?.needs ?? null)}
          />
        </>
      ) : (
        <WeekView week={week} />
      )}
      <p className="body-sm" style={{ marginTop: 18, opacity: 0.8 }}>
        {S.nutritionSource}
      </p>
    </div>
  );
}

function FamilySection({
  title,
  line,
  renderStatus,
}: {
  title: string;
  line: string;
  renderStatus: (f: FoodFamily) => { label: string; strong: boolean } | null;
}) {
  return (
    <section style={{ marginTop: 20 }}>
      <h2 className="title">{title}</h2>
      <p className="body-sm">{line}</p>
      <div className="stack" style={{ marginTop: 12 }}>
        {familyOrder.map((f) => {
          const i = FAMILY_INDEX[f];
          const status = renderStatus(f);
          return (
            <div className="card between" key={f}>
              <div>
                <div className="body" style={{ fontWeight: 600 }}>
                  {S.familyLabels[i]}
                </div>
                <div className="body-sm">{S.familyExamples[i]}</div>
              </div>
              <span className={`pill-tag ${status?.strong ? "" : "muted"}`}>
                {status ? status.label : S.familyNotThisWeek}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NutrientSection({
  title,
  explainer,
  rows,
}: {
  title: string;
  explainer: string;
  rows: NutrientRow[];
}) {
  return (
    <section style={{ marginTop: 24 }}>
      <h2 className="title">{title}</h2>
      <p className="body-sm">{explainer}</p>
      <div className="stack" style={{ marginTop: 14 }}>
        {rows.map((r) => (
          <div key={r.def.label}>
            <div className="between" style={{ marginBottom: 6 }}>
              <span className="body" style={{ fontWeight: 600 }}>
                {r.def.label}
              </span>
              <span className="body-sm">
                {r.valueLabel} {r.targetLabel && <span className="muted">{S.nutritionOf(r.targetLabel)}</span>}
              </span>
            </div>
            <div className="bar-track">
              <div
                className={`bar-fill ${r.percent >= 80 ? "" : r.percent >= 40 ? "mid" : "low"}`}
                style={{ width: `${r.percent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WeekView({ week }: { week: { days: DayLedger[]; needs: DailyNeeds | null } | null }) {
  if (!week) return <p className="body muted" style={{ marginTop: 24 }}>Loading your week…</p>;

  const days = week.days;
  const daysWith = (f: FoodFamily) =>
    days.filter((d) => familiesEatenIn(d.meals).has(f)).length;
  const avg = averageTotals(days.map((d) => totalsFromMeals(d.meals)));

  return (
    <>
      <section style={{ marginTop: 20 }}>
        <h2 className="title">{S.weekDaysLabel}</h2>
        <p className="body-sm">{S.weekDaysExplainer}</p>
        <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
          {days.map((d) => {
            const fam = familiesEatenIn(d.meals);
            const all = fam.size === familyOrder.length;
            return (
              <div key={d.date} style={{ textAlign: "center", flex: 1 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    margin: "0 auto",
                    display: "grid",
                    placeItems: "center",
                    background: all ? "var(--sage)" : "var(--surface)",
                    color: all ? "var(--ground)" : "var(--neutral-700)",
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  {all ? "✓" : fam.size}
                </div>
                <div className="body-sm" style={{ marginTop: 4, fontSize: 11 }}>
                  {d.date.slice(8)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ marginTop: 22 }}>
        <h2 className="title">{S.familiesLabel}</h2>
        <p className="body-sm">{S.familiesLineWeek}</p>
        <div className="stack" style={{ marginTop: 12 }}>
          {familyOrder.map((f) => {
            const i = FAMILY_INDEX[f];
            const n = daysWith(f);
            const sub =
              n === 0 ? S.familyNotThisWeek : n === days.length ? S.familyEveryDay : S.familyDays(n, days.length);
            return (
              <div className="card between" key={f}>
                <div className="body" style={{ fontWeight: 600 }}>
                  {S.familyLabels[i]}
                </div>
                <span className={`pill-tag ${n >= 5 ? "" : "muted"}`}>{sub}</span>
              </div>
            );
          })}
        </div>
      </section>

      <NutrientSection
        title={S.nutritionWeek}
        explainer={S.nutritionWeekExplainer}
        rows={nutrientRows(avg, week.needs)}
      />
    </>
  );
}
