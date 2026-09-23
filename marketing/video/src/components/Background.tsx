import { AbsoluteFill, interpolate, interpolateColors, useCurrentFrame } from "remotion";
import { FOODS } from "./Foods";
import { HEIGHT } from "../timing";

// Per-scene palette: [top, middle, bottom]. Blended over ~25 frames at each
// scene boundary so the backdrop feels like one continuous, breathing surface.
const STOPS = [0, 138, 163, 348, 373, 588, 613, 768, 793, 900];
const PALETTE = [
  ["#B75B28", "#D6885A", "#F0C6A3"], // snap — deep terracotta → peach
  ["#B75B28", "#D6885A", "#F0C6A3"],
  ["#E8A374", "#F6CFAE", "#FBEFE1"], // log — peach → cream
  ["#E8A374", "#F6CFAE", "#FBEFE1"],
  ["#F3D3B2", "#F9EEDC", "#E6EDD2"], // nutrition — cream with a sage floor
  ["#F3D3B2", "#F9EEDC", "#E6EDD2"],
  ["#FBEDDD", "#F5D6BB", "#E8A374"], // ask — cream → warm peach
  ["#FBEDDD", "#F5D6BB", "#E8A374"],
  ["#C97941", "#C1703C", "#A85A2A"], // logo — the icon's terracotta
  ["#C97941", "#C1703C", "#A85A2A"],
];

export const useSceneColors = () => {
  const frame = useCurrentFrame();
  const pick = (i: number) =>
    interpolateColors(
      frame,
      STOPS,
      PALETTE.map((p) => p[i]),
    );
  return [pick(0), pick(1), pick(2)] as const;
};

// Film grain: a tiny SVG turbulence tile, repeated. Cheap and deterministic.
const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.4 0 0 0 0 0.3 0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`,
)}")`;

type Float = { food: number; x: number; y: number; size: number; depth: number; rot: number; phase: number };

// Hand-placed so nothing sits in the caption band (y > 1440) except at the
// far edges; the phone hides whatever drifts under it.
const FLOATS: Float[] = [
  { food: 0, x: 60, y: 300, size: 150, depth: 1.0, rot: -25, phase: 0.3 },
  { food: 1, x: 900, y: 210, size: 120, depth: 0.8, rot: 12, phase: 1.1 },
  { food: 2, x: 880, y: 720, size: 140, depth: 1.1, rot: 30, phase: 2.0 },
  { food: 3, x: 40, y: 880, size: 100, depth: 0.6, rot: -10, phase: 2.8 },
  { food: 4, x: 930, y: 1150, size: 130, depth: 0.9, rot: 8, phase: 3.6 },
  { food: 5, x: 30, y: 1220, size: 130, depth: 0.7, rot: 20, phase: 4.2 },
  { food: 6, x: 110, y: 560, size: 110, depth: 0.55, rot: -18, phase: 5.0 },
  { food: 7, x: 800, y: 60, size: 90, depth: 0.5, rot: 0, phase: 5.7 },
  { food: 8, x: 20, y: 1620, size: 110, depth: 0.7, rot: 12, phase: 0.9 },
  { food: 1, x: 960, y: 1580, size: 100, depth: 0.6, rot: -20, phase: 1.7 },
  { food: 7, x: 900, y: 1800, size: 120, depth: 0.85, rot: 25, phase: 2.4 },
  { food: 0, x: 20, y: 1800, size: 110, depth: 0.5, rot: 40, phase: 3.1 },
];

export const Background = () => {
  const frame = useCurrentFrame();
  const [top, mid, bottom] = useSceneColors();

  // Slow, continuous parallax drift: everything floats up a little, near
  // items faster than far ones, with a gentle sway.
  const t = frame / 30;
  // The light blobs read as smudges on the solid terracotta closer; fade them.
  const blobs = interpolate(frame, [768, 800], [1, 0.25], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: `linear-gradient(175deg, ${top} 0%, ${mid} 52%, ${bottom} 100%)` }}>
      {/* Soft light blobs for depth */}
      <div
        style={{
          position: "absolute",
          left: -300 + Math.sin(t * 0.35) * 60,
          top: 120 + Math.cos(t * 0.25) * 50,
          width: 900,
          height: 900,
          borderRadius: "50%",
          opacity: blobs,
          background: `radial-gradient(circle, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0) 65%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 420 + Math.cos(t * 0.3) * 70,
          top: 900 + Math.sin(t * 0.2) * 60,
          width: 1000,
          height: 1000,
          borderRadius: "50%",
          opacity: blobs,
          background: `radial-gradient(circle, rgba(255,228,200,0.35) 0%, rgba(255,228,200,0) 65%)`,
        }}
      />

      {FLOATS.map((f, i) => {
        const Food = FOODS[f.food];
        const dy = -((t * 22 * f.depth) % (HEIGHT + 300));
        const y = ((f.y + dy + HEIGHT + 300) % (HEIGHT + 300)) - 150;
        const x = f.x + Math.sin(t * 0.6 + f.phase) * 18 * f.depth;
        const rot = f.rot + Math.sin(t * 0.4 + f.phase) * 8;
        const near = f.depth >= 0.85;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              transform: `rotate(${rot}deg) scale(${0.7 + f.depth * 0.3})`,
              opacity: near ? 0.62 : 0.4,
              filter: near ? "drop-shadow(0 12px 18px rgba(80,40,10,0.18))" : "blur(1.5px)",
            }}
          >
            <Food size={f.size} />
          </div>
        );
      })}

      {/* Grain */}
      <AbsoluteFill
        style={{
          backgroundImage: GRAIN,
          backgroundSize: "220px 220px",
          backgroundPosition: `${(frame % 4) * 37}px ${(frame % 3) * 53}px`,
          opacity: 0.09,
          mixBlendMode: "multiply",
        }}
      />
      {/* Gentle vignette so the centre (phone) reads brighter */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse 70% 55% at 50% 40%, rgba(0,0,0,0) 55%, rgba(60,25,5,0.10) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
