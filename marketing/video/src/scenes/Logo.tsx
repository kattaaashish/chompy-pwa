import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AppIcon } from "../components/Brand";
import { C, FONT } from "../theme";
import { SCENES, WIDTH } from "../timing";

const LogoInner = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const icon = spring({ frame: frame - 4, fps, config: { damping: 12, stiffness: 110, mass: 0.9 } });
  const word = spring({ frame: frame - 16, fps, config: { damping: 16, stiffness: 120 } });
  const tag = spring({ frame: frame - 30, fps, config: { damping: 18, stiffness: 120 } });
  const url = interpolate(frame, [48, 66], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const glow = 0.22 + Math.sin(frame * 0.09) * 0.06;
  const fadeIn = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ alignItems: "center", opacity: fadeIn }}>
      {/* glow behind the icon */}
      <div
        style={{
          position: "absolute",
          top: 470,
          left: WIDTH / 2 - 320,
          width: 640,
          height: 640,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(255,222,190,${glow}) 0%, rgba(255,222,190,0) 62%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 640,
          transform: `scale(${interpolate(icon, [0, 1], [0.4, 1])}) rotate(${interpolate(icon, [0, 1], [-14, 0])}deg)`,
          opacity: icon,
        }}
      >
        <AppIcon size={300} />
      </div>
      <div
        style={{
          position: "absolute",
          top: 990,
          fontFamily: FONT.display,
          fontSize: 132,
          lineHeight: 1,
          color: C.white,
          opacity: word,
          transform: `translateY(${(1 - word) * 30}px)`,
          textShadow: "0 6px 30px rgba(90,40,10,0.30)",
          letterSpacing: -1,
        }}
      >
        Chompy
      </div>
      <div
        style={{
          position: "absolute",
          top: 1170,
          width: 900,
          textAlign: "center",
          fontFamily: FONT.body,
          fontWeight: 800,
          fontSize: 54,
          lineHeight: 1.25,
          color: C.white,
          opacity: tag,
          transform: `translateY(${(1 - tag) * 26}px)`,
          textShadow: "0 2px 16px rgba(90,40,10,0.25)",
        }}
      >
        Snap their meals.
        <br />
        Know their nutrition.
      </div>
      <div
        style={{
          position: "absolute",
          top: 1420,
          fontFamily: FONT.body,
          fontWeight: 700,
          fontSize: 30,
          color: "rgba(255,248,238,0.78)",
          opacity: url,
          letterSpacing: 0.5,
        }}
      >
        chompy-pwa.ak-projects.workers.dev
      </div>
    </AbsoluteFill>
  );
};

export const LogoScene = () => (
  <Sequence from={SCENES.logo.from} durationInFrames={SCENES.logo.to - SCENES.logo.from} layout="none">
    <LogoInner />
  </Sequence>
);
