import { useStore } from "../../store";
import { Shell, Mascot, PrimaryButton, Kicker } from "../../components";
import { S } from "../../strings";

export function FactScreen() {
  const s = useStore();
  const fact = s.fact?.trim() || S.factFallback;
  return (
    <Shell>
      <div className="grow" />
      <div className="center" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Mascot size={130} />
        <div
          className="card"
          style={{ marginTop: 28, background: "var(--accent)", boxShadow: "var(--shadow-md)" }}
        >
          <Kicker>
            <span style={{ color: "var(--ground)", opacity: 0.85 }}>{S.factKicker}</span>
          </Kicker>
          <p className="body" style={{ color: "var(--ground)", fontSize: 19, lineHeight: 1.45 }}>
            {fact}
          </p>
        </div>
      </div>
      <div className="grow" />
      <PrimaryButton onClick={() => s.showSaved()}>{S.factFinish}</PrimaryButton>
    </Shell>
  );
}
