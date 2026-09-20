import { useStore } from "../../store";
import { Shell, Mascot, PrimaryButton } from "../../components";
import { S } from "../../strings";

export function SavedScreen() {
  const s = useStore();
  return (
    <Shell>
      <div className="grow" />
      <div className="center" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Mascot size={140} />
        <h2 className="display" style={{ marginTop: 28 }}>
          {S.savedTitle}
        </h2>
        <p className="body muted" style={{ marginTop: 10, maxWidth: 300 }}>
          {S.savedBody(s.savedCategory, s.savedCount)}
        </p>
      </div>
      <div className="grow" />
      <PrimaryButton onClick={() => s.backHome()}>{S.savedCta}</PrimaryButton>
    </Shell>
  );
}
