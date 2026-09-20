import { useStore } from "../../store";
import { Shell, Mascot, PrimaryButton } from "../../components";
import { S } from "../../strings";

export function CancelledScreen() {
  const s = useStore();
  return (
    <Shell>
      <div className="grow" />
      <div className="center" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Mascot size={120} />
        <h2 className="display" style={{ marginTop: 24 }}>
          {S.cancelledTitle}
        </h2>
        <p className="body muted" style={{ marginTop: 10, maxWidth: 300 }}>
          {S.cancelledBody}
        </p>
      </div>
      <div className="grow" />
      <PrimaryButton onClick={() => s.openLogMeal()}>{S.cancelledRetry}</PrimaryButton>
      <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => s.chooseType()}>
        {S.cancelledOther}
      </button>
    </Shell>
  );
}
