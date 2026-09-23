import type { CSSProperties, ReactNode } from "react";
import { Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { BEZEL, K, PHONE_LEFT, PHONE_TOP, SCREEN_H, SCREEN_W, SCREEN_XFADE, STATUS_PAD } from "../timing";
import layoutJson from "../../public/shots/layout.json";

export const layout = layoutJson;
export type Box = { x: number; y: number; w: number; h: number };

// App CSS px → screen px inside the phone.
export const px = (v: number) => v * K;
export const boxStyle = (b: Box, scroll = 0): CSSProperties => ({
  position: "absolute",
  left: px(b.x),
  top: STATUS_PAD + px(b.y - scroll),
  width: px(b.w),
  height: px(b.h),
});

// Device frame. Children render inside the screen (SCREEN_W x SCREEN_H).
export const Phone = ({
  children,
  style,
  lightStatus = false,
}: {
  children: ReactNode;
  style?: CSSProperties;
  lightStatus?: boolean;
}) => {
  const ink = lightStatus ? "#ffffff" : "#201e1d";
  return (
  <div
    style={{
      position: "absolute",
      left: PHONE_LEFT - BEZEL,
      top: PHONE_TOP - BEZEL,
      width: SCREEN_W + BEZEL * 2,
      height: SCREEN_H + BEZEL * 2,
      borderRadius: 72,
      background: "linear-gradient(160deg, #2b2724 0%, #17140f 55%, #2a2521 100%)",
      boxShadow:
        "0 40px 90px rgba(70,30,5,0.38), 0 12px 28px rgba(70,30,5,0.22), inset 0 0 0 2px rgba(255,255,255,0.08)",
      ...style,
    }}
  >
    <div
      style={{
        position: "absolute",
        left: BEZEL,
        top: BEZEL,
        width: SCREEN_W,
        height: SCREEN_H,
        borderRadius: 60,
        overflow: "hidden",
        background: "#f9f4ed",
      }}
    >
      {children}
      {/* Home indicator */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: SCREEN_W / 2 - 80,
          width: 160,
          height: 6,
          borderRadius: 3,
          background: lightStatus ? "rgba(255,255,255,0.9)" : "rgba(32,30,29,0.85)",
        }}
      />
      {/* Dynamic island */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: SCREEN_W / 2 - 78,
          width: 156,
          height: 46,
          borderRadius: 30,
          background: "#0b0a09",
        }}
      />
      {/* Status bar */}
      <div
        style={{
          position: "absolute",
          top: 24,
          left: 46,
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontWeight: 700,
          fontSize: 22,
          color: ink,
          letterSpacing: -0.5,
        }}
      >
        9:41
      </div>
      <div style={{ position: "absolute", top: 27, right: 46, display: "flex", gap: 8, alignItems: "center" }}>
        <svg width={26} height={18} viewBox="0 0 26 18">
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={i * 6.5} y={12 - i * 4} width={4.5} height={6 + i * 4} rx={1.2} fill={ink} />
          ))}
        </svg>
        <svg width={38} height={18} viewBox="0 0 38 18">
          <rect x={0.75} y={0.75} width={32} height={16.5} rx={5} fill="none" stroke={ink} strokeOpacity={0.5} strokeWidth={1.5} />
          <rect x={3} y={3} width={27} height={12} rx={3} fill={ink} />
          <rect x={35} y={6} width={2.5} height={6} rx={1} fill={ink} fillOpacity={0.5} />
        </svg>
      </div>
    </div>
    {/* Glass highlight */}
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 72,
        background: "linear-gradient(120deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 35%)",
        pointerEvents: "none",
      }}
    />
  </div>
  );
};

// A real screenshot of the app, scrolled by `scroll` CSS px. The status-bar
// area of the shot is left blank by the app (safe-area padding), so the
// phone's own status bar sits over it cleanly.
export const Shot = ({ name, scroll = 0, style }: { name: string; scroll?: number; style?: CSSProperties }) => (
  <Img
    src={staticFile(`shots/${name}.png`)}
    style={{
      position: "absolute",
      left: 0,
      top: STATUS_PAD - px(scroll),
      width: SCREEN_W,
      display: "block",
      ...style,
    }}
  />
);

// A screen that pushes in from the right over the previous one, then holds.
export const Screen = ({
  from,
  to,
  children,
  enter = "push",
  strip = "#f9f4ed",
}: {
  from: number;
  to: number;
  children: ReactNode;
  enter?: "push" | "fade" | "none";
  // Colour of the safe-area strip under the status bar (null = none, e.g. camera).
  strip?: string | null;
}) => (
  <Sequence from={from} durationInFrames={to - from} layout="none">
    <ScreenInner enter={enter} strip={strip}>
      {children}
    </ScreenInner>
  </Sequence>
);

const ScreenInner = ({
  children,
  enter,
  strip,
}: {
  children: ReactNode;
  enter: "push" | "fade" | "none";
  strip: string | null;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 22, stiffness: 140, mass: 0.9 } });
  const x = enter === "push" ? interpolate(s, [0, 1], [SCREEN_W, 0]) : 0;
  // Pushes stay opaque (they slide over the old screen); only fades ramp.
  const opacity =
    enter === "fade" ? interpolate(frame, [0, SCREEN_XFADE * 0.6], [0, 1], { extrapolateRight: "clamp" }) : 1;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `translateX(${x}px)`,
        opacity,
        background: "#f9f4ed",
        boxShadow: enter === "push" ? "-20px 0 40px rgba(0,0,0,0.12)" : undefined,
      }}
    >
      {children}
      {strip && <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: STATUS_PAD, background: strip }} />}
    </div>
  );
};

// A rectangular region of a shot, cropped out so it can be animated on its
// own (cards popping in, pills bouncing). `pad` grows the crop to keep the
// card's drop shadow. Position matches the underlying Shot exactly when the
// transform is identity, so revealed pieces land pixel-perfect.
export const Clip = ({
  name,
  box,
  scroll = 0,
  pad = 0,
  radius = 0,
  style,
}: {
  name: string;
  box: Box;
  scroll?: number;
  pad?: number;
  radius?: number;
  style?: CSSProperties;
}) => {
  const b = { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
  return (
    <div style={{ ...boxStyle(b, scroll), overflow: "hidden", borderRadius: radius, ...style }}>
      <Img
        src={staticFile(`shots/${name}.png`)}
        style={{ position: "absolute", left: -px(b.x), top: -px(b.y), width: SCREEN_W, display: "block" }}
      />
    </div>
  );
};

// Hides a region of the underlying shot (until its animated Clip arrives).
export const Cover = ({
  box,
  scroll = 0,
  pad = 0,
  color = "#f9f4ed",
  style,
}: {
  box: Box;
  scroll?: number;
  pad?: number;
  color?: string;
  style?: CSSProperties;
}) => {
  const b = { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
  return <div style={{ ...boxStyle(b, scroll), background: color, ...style }} />;
};

// Tap feedback: a fingertip dot with an expanding terracotta ring, centred on
// a box. `frame` is local to the tap (0 = touch down).
export const Tap = ({ box, scroll = 0, frame }: { box: Box; scroll?: number; frame: number }) => {
  if (frame < 0 || frame > 26) return null;
  const cx = px(box.x + box.w * 0.5);
  const cy = STATUS_PAD + px(box.y - scroll + box.h * 0.5);
  const ring = interpolate(frame, [0, 26], [20, 120]);
  const ringO = interpolate(frame, [0, 26], [0.5, 0]);
  const dotO = interpolate(frame, [0, 4, 14, 22], [0, 0.9, 0.9, 0]);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: cx - ring / 2,
          top: cy - ring / 2,
          width: ring,
          height: ring,
          borderRadius: "50%",
          border: "3px solid #C67139",
          opacity: ringO,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: cx - 22,
          top: cy - 22,
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "rgba(198,113,57,0.35)",
          boxShadow: "0 0 0 6px rgba(198,113,57,0.15)",
          opacity: dotO,
        }}
      />
    </>
  );
};
