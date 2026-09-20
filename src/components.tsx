// Small shared UI pieces used across screens.
import type { ReactNode } from "react";

export function Shell({ children }: { children: ReactNode }) {
  return <div className="shell fade-in">{children}</div>;
}

// Chompy's blob mascot. `size` in px.
export function Mascot({ size = 120 }: { size?: number }) {
  return (
    <div className="mascot" style={{ width: size, height: size }} aria-hidden>
      <div className="eyes" style={{ marginTop: size * 0.1 }}>
        <span className="eye" />
        <span className="eye" />
      </div>
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  arrow = true,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  arrow?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button className="btn-primary" onClick={onClick} disabled={disabled} type={type}>
      <span>{children}</span>
      {arrow && <span aria-hidden>→</span>}
    </button>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <p className="kicker">{children}</p>;
}

// A determinate-looking progress bar for transient waits (never a spinner —
// a spinner reads as "stuck" to a child).
export function LoadingView({ title, body }: { title: string; body?: string }) {
  return (
    <Shell>
      <div className="grow" />
      <div className="center stack" style={{ alignItems: "center", display: "flex", flexDirection: "column" }}>
        <Mascot size={130} />
        <h2 className="display" style={{ marginTop: 28 }}>
          {title}
        </h2>
        {body && <p className="body muted" style={{ maxWidth: 300 }}>{body}</p>}
        <div className="bar-track indeterminate" style={{ width: 200, marginTop: 20 }}>
          <div className="bar-fill anim" style={{ width: "45%" }} />
        </div>
      </div>
      <div className="grow" />
    </Shell>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div
      className="body-sm"
      style={{
        background: "var(--accent-tint)",
        color: "var(--accent-deep)",
        borderRadius: 16,
        padding: "12px 16px",
        marginTop: 12,
      }}
    >
      {children}
    </div>
  );
}
