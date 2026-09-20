import { useEffect, useState } from "react";
import { useStore } from "../store";
import { api, ApiError } from "../api";
import { Shell, PrimaryButton, ErrorNote } from "../components";
import { S } from "../strings";
import {
  disableReminders,
  enableReminders,
  reminderState,
  type ReminderState,
} from "../push";

interface Loaded {
  name: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  heightCm: number | null;
  weightKg: number | null;
}

export function ProfileView({ onBack }: { onBack: () => void }) {
  const s = useStore();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [editing, setEditing] = useState(false);

  // Editable fields
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function hydrate(p: Loaded) {
    setName(p.name);
    setDob(p.dateOfBirth);
    setGender((p.gender as "male" | "female") || "");
    setHeight(p.heightCm != null ? String(p.heightCm) : "");
    setWeight(p.weightKg != null ? String(p.weightKg) : "");
  }

  useEffect(() => {
    if (!s.token) return;
    api
      .getProfile(s.token)
      .then((p) => {
        setLoaded(p);
        hydrate(p);
      })
      .catch(() => setGeneral("Couldn't load your profile."));
  }, [s.token]);

  const ready = name.trim() && dob && gender && height && weight;

  async function save() {
    setSaving(true);
    setErrors({});
    setGeneral(null);
    try {
      await s.saveProfile({
        name: name.trim(),
        dateOfBirth: dob,
        gender: gender as "male" | "female",
        heightCm: Number(height),
        weightKg: Number(weight),
      });
      const fresh = { name: name.trim(), dateOfBirth: dob, gender, phone: loaded?.phone ?? "", heightCm: Number(height), weightKg: Number(weight) };
      setLoaded(fresh as Loaded);
      setEditing(false);
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fieldErrors);
        if (Object.keys(e.fieldErrors).length === 0) setGeneral(e.message);
      } else {
        setGeneral("Something went wrong.");
      }
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (loaded) hydrate(loaded);
    setErrors({});
    setGeneral(null);
    setEditing(false);
  }

  return (
    <Shell>
      <div className="between">
        <button className="btn-text" onClick={editing ? cancel : onBack}>
          ← {editing ? "Cancel" : "Home"}
        </button>
        <h1 className="title">Profile</h1>
        {loaded && !editing ? (
          <button className="btn-text" onClick={() => setEditing(true)}>
            Edit
          </button>
        ) : (
          <span style={{ width: 44 }} />
        )}
      </div>

      {!loaded && !general && (
        <p className="body muted" style={{ marginTop: 24 }}>
          Loading…
        </p>
      )}

      {loaded && (
        <div className="stack" style={{ marginTop: 20 }}>
          <Field label="Phone">
            <div className="field" style={{ display: "flex", alignItems: "center", color: "var(--neutral-700)" }}>
              +91 {loaded.phone}
            </div>
          </Field>

          <Field label={S.labelName} error={errors.name}>
            {editing ? (
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
            ) : (
              <ReadRow>{loaded.name || "—"}</ReadRow>
            )}
          </Field>

          <Field label={S.labelDob} error={errors.dateOfBirth}>
            {editing ? (
              <input className="field" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            ) : (
              <ReadRow>{loaded.dateOfBirth || "—"}</ReadRow>
            )}
          </Field>

          <Field label={S.labelGender} error={errors.gender}>
            {editing ? (
              <div className="chip-row">
                <button className={`chip ${gender === "male" ? "active" : ""}`} onClick={() => setGender("male")}>
                  {S.genders[0]}
                </button>
                <button className={`chip ${gender === "female" ? "active" : ""}`} onClick={() => setGender("female")}>
                  {S.genders[1]}
                </button>
              </div>
            ) : (
              <ReadRow>{loaded.gender === "female" ? S.genders[1] : loaded.gender === "male" ? S.genders[0] : "—"}</ReadRow>
            )}
          </Field>

          <div className="row" style={{ alignItems: "flex-start" }}>
            <Field label={S.labelHeight} error={errors.height}>
              {editing ? (
                <input className="field" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />
              ) : (
                <ReadRow>{loaded.heightCm != null ? `${loaded.heightCm} cm` : "—"}</ReadRow>
              )}
            </Field>
            <Field label={S.labelWeight} error={errors.weight}>
              {editing ? (
                <input className="field" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
              ) : (
                <ReadRow>{loaded.weightKg != null ? `${loaded.weightKg} kg` : "—"}</ReadRow>
              )}
            </Field>
          </div>

          {editing && (
            <p className="body-sm">
              Editing height or weight adds a new measurement — growth is tracked over time.
            </p>
          )}
        </div>
      )}

      <ErrorNote>{general}</ErrorNote>

      {!editing && <RemindersCard />}

      {editing && (
        <>
          <div className="grow" style={{ minHeight: 16 }} />
          <PrimaryButton disabled={!ready || saving} onClick={save} arrow={false}>
            {saving ? "Saving…" : "Save changes"}
          </PrimaryButton>
        </>
      )}
    </Shell>
  );
}

// Meal-reminder push toggle. Times are fixed on the server (10am breakfast,
// 5pm lunch+snacks, 9pm dinner, IST).
function RemindersCard() {
  const s = useStore();
  const [state, setState] = useState<ReminderState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    reminderState().then(setState).catch(() => setState("unsupported"));
  }, []);

  async function toggle() {
    if (!s.token) return;
    setBusy(true);
    setErr(null);
    try {
      if (state === "on") {
        await disableReminders(s.token);
        setState("off");
      } else {
        await enableReminders(s.token);
        setState("on");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
      setState(await reminderState().catch(() => state));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ marginTop: 28 }}>
      <h2 className="title" style={{ fontSize: 18 }}>
        Meal reminders
      </h2>
      <p className="body-sm" style={{ marginTop: 4 }}>
        Breakfast at 10am · lunch & snacks at 5pm · dinner at 9pm.
      </p>

      {state === "unsupported" && (
        <p className="body-sm" style={{ marginTop: 10 }}>
          Reminders aren’t supported in this browser. On iPhone/iPad, add Chompy to your
          Home Screen and open it from there.
        </p>
      )}
      {state === "denied" && (
        <p className="body-sm" style={{ marginTop: 10, color: "var(--accent-deep)" }}>
          Notifications are blocked. Enable them for Chompy in your browser/device settings.
        </p>
      )}
      {(state === "on" || state === "off") && (
        <button
          className={state === "on" ? "btn-secondary" : "btn-primary"}
          style={{ marginTop: 12 }}
          onClick={toggle}
          disabled={busy}
        >
          <span>
            {busy
              ? "…"
              : state === "on"
                ? "Turn off reminders"
                : "Turn on meal reminders"}
          </span>
          {state !== "on" && <span aria-hidden>→</span>}
        </button>
      )}
      {state === "on" && (
        <p className="body-sm" style={{ marginTop: 8, color: "var(--sage-deep)" }}>
          Reminders are on ✓
        </p>
      )}
      <ErrorNote>{err}</ErrorNote>
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ flex: 1 }}>
      <p className="field-label">{label}</p>
      {children}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

function ReadRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="body" style={{ fontWeight: 600, padding: "4px 4px" }}>
      {children}
    </div>
  );
}
