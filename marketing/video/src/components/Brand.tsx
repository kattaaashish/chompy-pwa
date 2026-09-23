import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "../theme";
import { SCENES, WIDTH } from "../timing";

// The app icon, masked to an iOS-style squircle.
export const AppIcon = ({ size, shadow = true }: { size: number; shadow?: boolean }) => (
  <Img
    src={staticFile("icon.png")}
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.235,
      display: "block",
      boxShadow: shadow ? `0 ${size * 0.08}px ${size * 0.25}px rgba(90,40,10,0.28)` : undefined,
    }}
  />
);

// Small brand lockup pinned to the top during the product scenes. Text is cream
// on the dark opening backdrop and ink afterwards.
export const Brand = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 6, fps, config: { damping: 18, stiffness: 120 } });
  const light = interpolate(frame, [SCENES.log.from - 12, SCENES.log.from + 12], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const out = interpolate(frame, [SCENES.logo.from - 14, SCENES.logo.from], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const text = {
    fontFamily: FONT.display,
    fontSize: 40,
    lineHeight: 1,
    whiteSpace: "nowrap" as const,
  };
  return (
    <div
      style={{
        position: "absolute",
        top: 62,
        left: 0,
        width: WIDTH,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 18,
        opacity: enter * out,
        transform: `translateY(${(1 - enter) * -20}px)`,
      }}
    >
      <AppIcon size={56} />
      <span style={{ position: "relative", ...text }}>
        <span style={{ color: C.ink, opacity: 1 - light }}>Chompy</span>
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            color: C.white,
            opacity: light,
            textShadow: "0 2px 12px rgba(80,30,0,0.25)",
          }}
        >
          Chompy
        </span>
      </span>
    </div>
  );
};
