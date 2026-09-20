import { useStore } from "../store";
import { Shell, Mascot, PrimaryButton } from "../components";
import { S } from "../strings";

export function WelcomeScreen() {
  const s = useStore();
  return (
    <Shell>
      <div className="grow" />
      <Mascot size={150} />
      <h1 className="display" style={{ whiteSpace: "pre-line", marginTop: 32 }}>
        {S.welcomeTitle}
      </h1>
      <p className="body muted" style={{ marginTop: 12, maxWidth: 320 }}>
        {S.welcomeBody}
      </p>
      <div className="grow" />
      <PrimaryButton onClick={() => s.startPhone()}>{S.welcomeCta}</PrimaryButton>
    </Shell>
  );
}
