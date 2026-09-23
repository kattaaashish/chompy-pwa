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
  nutrientRows,
  type NutrientRow,
} from "../models";

// The IST calendar day today (matches the server's istDayKey), so we can drop
// today from the week strip — today already lives in the "Today" tab.
function istTodayKey(): string {
  const ist = new Date(Date.now() + (5 * 60 + 30) * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`;
}

// "2026-09-22" -> "Mon, 22 Sep" (rendered in IST so the weekday/day are right).
function formatDayLabel(date: string): string {
  const dt = new Date(`${date}T00:00:00+05:30`);
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}

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

// The "This week" tab: a day picker over the earlier days (today excluded — it
// lives in the Today tab). Selecting a day shows that day's own Today-style
// breakdown (families eaten + nutrients vs target). No averaging across days.
function WeekView({ week }: { week: { days: DayLedger[]; needs: DailyNeeds | null } | null }) {
  const [selected, setSelected] = useState<string | null>(null);

  if (!week) return <p className="body muted" style={{ marginTop: 24 }}>Loading your days…</p>;

  const todayKey = istTodayKey();
  const past = week.days.filter((d) => d.date !== todayKey);
  if (past.length === 0)
    return <p className="body muted" style={{ marginTop: 24 }}>No earlier days yet.</p>;

  // Selected day, defaulting to the most recent (last in oldest→newest order).
  const activeDate =
    selected && past.some((d) => d.date === selected) ? selected : past[past.length - 1].date;
  const sel = past.find((d) => d.date === activeDate)!;
  const eaten = familiesEatenIn(sel.meals);

  return (
    <>
      <section style={{ marginTop: 20 }}>
        <h2 className="title">{S.weekDaysLabel}</h2>
        <p className="body-sm">{S.weekDaysExplainer}</p>
        <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
          {past.map((d) => {
            const fam = familiesEatenIn(d.meals);
            const all = fam.size === familyOrder.length;
            const isSel = d.date === activeDate;
            return (
              <button
                key={d.date}
                onClick={() => setSelected(d.date)}
                aria-pressed={isSel}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "center",
                  flex: 1,
                }}
              >
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
                    boxShadow: isSel ? "0 0 0 2px var(--ground)" : "none",
                  }}
                >
                  {all ? "✓" : fam.size}
                </div>
                <div
                  className="body-sm"
                  style={{ marginTop: 4, fontSize: 11, fontWeight: isSel ? 700 : 400 }}
                >
                  {d.date.slice(8)}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <h2 className="title" style={{ marginTop: 24 }}>
        {formatDayLabel(sel.date)}
      </h2>
      {sel.meals.length === 0 && <p className="body-sm">{S.dayNoMeals}</p>}

      <FamilySection
        title={S.familiesLabel}
        line={S.familiesLineDay(eaten.size)}
        renderStatus={(f) => (eaten.has(f) ? { label: S.familyEatenDay, strong: true } : null)}
      />
      <NutrientSection
        title={S.nutritionDay}
        explainer={S.nutritionTodayExplainer}
        rows={nutrientRows(totalsFromMeals(sel.meals), week.needs)}
      />
    </>
  );
}
