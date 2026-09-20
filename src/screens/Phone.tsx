import { useState } from "react";
import { useStore } from "../store";
import { Shell, PrimaryButton, Kicker, ErrorNote } from "../components";
import { S } from "../strings";

export function PhoneScreen() {
  const s = useStore();
  const [phone, setPhone] = useState(s.phone);
  const digits = phone.replace(/\D/g, "").slice(0, 10);
  const valid = digits.length === 10;

  const hint = valid
    ? S.phoneHintValid
    : digits.length === 0
      ? S.phoneHintEmpty
      : S.phoneHintRemaining(10 - digits.length);

  return (
    <Shell>
      <Kicker>{S.phoneStep}</Kicker>
      <h2 className="display">{S.phoneTitle}</h2>
      <p className="body muted" style={{ marginTop: 10 }}>
        {S.phoneBody}
      </p>

      <div style={{ marginTop: 28 }}>
        <input
          className="field"
          inputMode="numeric"
          autoComplete="tel"
          placeholder={S.phonePlaceholder}
          value={digits}
          onChange={(e) => setPhone(e.target.value)}
          style={{ fontSize: 22, letterSpacing: 1 }}
        />
        <p className="body-sm" style={{ margin: "8px 0 0 4px", color: valid ? "var(--sage-deep)" : "var(--neutral-700)" }}>
          {hint}
        </p>
        <ErrorNote>{s.busyError}</ErrorNote>
      </div>

      <div className="grow" />
      <PrimaryButton disabled={!valid} onClick={() => s.sendOtp(digits)}>
        {S.phoneCta}
      </PrimaryButton>
    </Shell>
  );
}
