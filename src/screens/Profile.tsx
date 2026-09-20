import { useState } from "react";
import { useStore } from "../store";
import { ApiError } from "../api";
import { Shell, PrimaryButton, Kicker, ErrorNote } from "../components";
import { S } from "../strings";

export function ProfileScreen() {
  const s = useStore();
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [general, setGeneral] = useState<string | null>(null);

  const ready = name.trim() && dob && gender && height && weight;

  async function submit() {
    setSaving(true);
    setErrors({});
    setGeneral(null);
    try {
      await s.submitProfile({
        name: name.trim(),
        dateOfBirth: dob,
        gender: gender as "male" | "female",
        heightCm: Number(height),
        weightKg: Number(weight),
      });
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fieldErrors);
        if (Object.keys(e.fieldErrors).length === 0) setGeneral(e.message);
      } else {
        setGeneral("Something went wrong.");
      }
      setSaving(false);
    }
  }

  return (
    <Shell>
      <Kicker>{S.profileStep}</Kicker>
      <h2 className="display">{S.profileTitle(name)}</h2>

      <div className="stack" style={{ marginTop: 24 }}>
        <Field label={S.labelName} error={errors.name}>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dhruv" />
        </Field>

        <Field label={S.labelDob} error={errors.dateOfBirth}>
          <input className="field" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        </Field>

        <Field label={S.labelGender} error={errors.gender}>
          <div className="chip-row">
            <button className={`chip ${gender === "male" ? "active" : ""}`} onClick={() => setGender("male")}>
              {S.genders[0]}
            </button>
            <button className={`chip ${gender === "female" ? "active" : ""}`} onClick={() => setGender("female")}>
              {S.genders[1]}
            </button>
          </div>
        </Field>

        <div className="row" style={{ alignItems: "flex-start" }}>
          <Field label={S.labelHeight} error={errors.height}>
            <input className="field" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="120" />
          </Field>
          <Field label={S.labelWeight} error={errors.weight}>
            <input className="field" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="24" />
          </Field>
        </div>
      </div>

      <p className="body-sm" style={{ marginTop: 14 }}>
        {S.profileHelper(name)}
      </p>
      <ErrorNote>{general}</ErrorNote>

      <div className="grow" style={{ minHeight: 18 }} />
      <PrimaryButton disabled={!ready || saving} onClick={submit}>
        {S.profileCtaReady}
      </PrimaryButton>
    </Shell>
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
