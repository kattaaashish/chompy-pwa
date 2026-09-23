import { Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "../theme";
import { BAND_H, BAND_TOP, WIDTH } from "../timing";

export type CaptionLine = { text: string; size?: number; weight?: number; muted?: boolean };

// Captions live in the lower band. Words spring up one after another; the
// whole block fades out just before the next caption. `accent` words are
// tinted terracotta (or peach on the dark opening scene).
export const Caption = ({
  from,
  to,
  lines,
  accent = [],
  tone = "dark",
}: {
  from: number;
  to: number;
  lines: CaptionLine[];
  accent?: string[];
  tone?: "dark" | "light";
}) => (
  <Sequence from={from} durationInFrames={to - from} layout="none">
    <CaptionInner lines={lines} accent={accent} tone={tone} duration={to - from} />
  </Sequence>
);

const CaptionInner = ({
  lines,
  accent,
  tone,
  duration,
}: {
  lines: CaptionLine[];
  accent: string[];
  tone: "dark" | "light";
  duration: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ink = tone === "dark" ? C.ink : C.white;
  const hi = tone === "dark" ? C.terracotta : "#FFD7B3";
  const out = interpolate(frame, [duration - 10, duration - 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  let wordIndex = 0;
  const normalize = (w: string) => w.replace(/[^\p{L}\p{N}']/gu, "").toLowerCase();
  const accents = new Set(accent.map(normalize));

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: BAND_TOP,
        width: WIDTH,
        height: BAND_H,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 90px",
        opacity: out,
        transform: `translateY(${(1 - out) * -12}px)`,
      }}
    >
      {lines.map((line, li) => {
        const size = line.size ?? 64;
        const weight = line.weight ?? 800;
        return (
          <div
            key={li}
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: `0 ${size * 0.26}px`,
              fontFamily: FONT.body,
              fontWeight: weight,
              fontSize: size,
              lineHeight: 1.18,
              color: line.muted ? (tone === "dark" ? C.neutral700 : "rgba(255,255,255,0.82)") : ink,
              textAlign: "center",
              letterSpacing: -0.5,
              marginTop: li === 0 ? 0 : size * 0.18,
              textShadow: tone === "light" ? "0 2px 18px rgba(80,30,0,0.25)" : "0 1px 0 rgba(255,255,255,0.35)",
            }}
          >
            {line.text.split(" ").map((w, wi) => {
              const i = wordIndex++;
              const s = spring({ frame: frame - i * 2.2, fps, config: { damping: 16, stiffness: 150, mass: 0.7 } });
              const isAccent = accents.has(normalize(w));
              return (
                <span
                  key={wi}
                  style={{
                    display: "inline-block",
                    opacity: s,
                    transform: `translateY(${(1 - s) * 34}px)`,
                    color: isAccent ? hi : undefined,
                  }}
                >
                  {w}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
