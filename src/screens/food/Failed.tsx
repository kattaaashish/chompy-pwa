import { useStore } from "../../store";
import { Shell, Mascot, PrimaryButton } from "../../components";
import { S } from "../../strings";

export function FailedScreen() {
  const s = useStore();
  return (
    <Shell>
      <div className="grow" />
      <div className="center" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Mascot size={120} />
        <h2 className="display" style={{ marginTop: 24 }}>
          {S.failedTitle}
        </h2>
        <p className="body muted" style={{ marginTop: 10, maxWidth: 300 }}>
          {S.failedBody}
        </p>
      </div>
      <div className="grow" />
      <PrimaryButton onClick={() => s.retrySave()}>{S.failedRetry}</PrimaryButton>
      <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => s.exitFood()}>
        {S.failedBack}
      </button>
    </Shell>
  );
}
