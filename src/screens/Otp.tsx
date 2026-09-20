import { useState } from "react";
import { useStore } from "../store";
import { Shell, PrimaryButton, Kicker, ErrorNote } from "../components";
import { S } from "../strings";

export function OtpScreen() {
  const s = useStore();
  const [code, setCode] = useState("");
  const digits = code.replace(/\D/g, "").slice(0, 6);
  const valid = digits.length === 6;

  const errorTitle =
    s.otpError === "expired" ? S.otpExpiredTitle : s.otpError === "wrong" ? S.otpWrongTitle : null;
  const errorBody =
    s.otpError === "expired" ? S.otpExpiredBody : s.otpError === "wrong" ? S.otpWrongBody : null;

  return (
    <Shell>
      <Kicker>{S.otpStep}</Kicker>
      <h2 className="display">{S.otpTitle}</h2>
      <p className="body muted" style={{ marginTop: 10 }}>
        {S.otpBody(s.phone)}
      </p>

      {s.debugCode && (
        <p className="body-sm" style={{ marginTop: 8, color: "var(--accent-deep)" }}>
          Dev code: <strong>{s.debugCode}</strong>
        </p>
      )}

      <div style={{ marginTop: 24 }}>
        <input
          className="field"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="••••••"
          value={digits}
          onChange={(e) => setCode(e.target.value)}
          style={{ fontSize: 30, letterSpacing: 14, textAlign: "center", fontWeight: 600 }}
        />
        {errorTitle && (
          <ErrorNote>
            <strong>{errorTitle}</strong>
            <br />
            {errorBody}
          </ErrorNote>
        )}
      </div>

      <div className="grow" />
      <PrimaryButton disabled={!valid} onClick={() => s.verifyOtp(digits)}>
        {S.otpCta}
      </PrimaryButton>
      <button className="btn-text" style={{ marginTop: 6 }} onClick={() => s.changeNumber()}>
        {S.otpChangeNumber}
      </button>
    </Shell>
  );
}
