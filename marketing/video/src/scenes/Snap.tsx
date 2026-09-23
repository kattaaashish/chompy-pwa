import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Caption } from "../components/Caption";
import { Screen, Shot, Tap, layout } from "../components/Phone";
import { Plate } from "../components/Plate";
import { C, FONT } from "../theme";
import { SCENES, SCREEN_W } from "../timing";

// Beats (global frames)
export const SNAP = {
  modeTo: 52, // "What did you eat?" chooser
  tap: 26, // tap "Take a photo"
  cameraFrom: 44,
  shutter: 104, // press
  flash: 107,
  captured: 112, // frozen photo shrinks into a snapshot card
};

export const SnapScreens = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <Screen from={0} to={SNAP.modeTo} enter="none">
        <Shot name="mode" />
        <Tap box={layout.mode.photo} frame={frame - SNAP.tap} />
      </Screen>
      <Screen from={SNAP.cameraFrom} to={SCENES.snap.to + 8} enter="fade" strip={null}>
        <Camera />
      </Screen>
    </>
  );
};

// The camera viewfinder: a plate on a wooden table, handheld drift, autofocus
// square, shutter, flash, then the frozen shot becomes a snapshot card with
// the app's own "Chompy is looking…" copy.
const Camera = () => {
  const frame = useCurrentFrame(); // local to the camera screen
  const { fps } = useVideoConfig();
  const g = frame + SNAP.cameraFrom; // global

  const captured = g >= SNAP.captured;
  const live = Math.min(frame, SNAP.captured - SNAP.cameraFrom);
  // Handheld sway + focus settle; frozen after the capture.
  const dx = Math.sin(live * 0.11) * 6 + Math.sin(live * 0.037) * 5;
  const dy = Math.cos(live * 0.09) * 6;
  const focus = interpolate(live, [0, 40], [1.1, 1.0], { extrapolateRight: "clamp" });
  const blur = interpolate(live, [0, 30], [3, 0], { extrapolateRight: "clamp" });

  const snap = spring({ frame: g - SNAP.captured, fps, config: { damping: 15, stiffness: 120 } });
  const cardScale = captured ? interpolate(snap, [0, 1], [1, 0.84]) : 1;
  const cardY = captured ? interpolate(snap, [0, 1], [0, -60]) : 0;
  const radius = captured ? interpolate(snap, [0, 1], [0, 34]) : 0;

  const flash = interpolate(g, [SNAP.flash, SNAP.flash + 2, SNAP.flash + 14], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const press = interpolate(g, [SNAP.shutter - 3, SNAP.shutter, SNAP.shutter + 6], [1, 0.82, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const focusIn = spring({ frame: live - 14, fps, config: { damping: 14, stiffness: 160 } });
  const focusOut = interpolate(live, [44, 54], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const focusLocked = live > 34;

  const plateSize = 520;
  const plateTop = 300;

  return (
    <AbsoluteFill style={{ background: "#0d0b09" }}>
      {/* Photo (table + plate) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translateY(${cardY}px) scale(${cardScale})`,
          transformOrigin: "50% 45%",
          borderRadius: radius,
          overflow: "hidden",
          boxShadow: captured ? `0 30px 60px rgba(0,0,0,${0.5 * snap})` : undefined,
          border: captured ? `${6 * snap}px solid rgba(255,255,255,${0.9 * snap})` : undefined,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: -40,
            background:
              "radial-gradient(ellipse 80% 60% at 50% 40%, #9A6236 0%, #7A4A26 45%, #4F2E15 100%)",
            transform: `translate(${dx}px, ${dy}px) scale(${focus})`,
            filter: `blur(${blur}px)`,
          }}
        >
          {/* wood grain */}
          {Array.from({ length: 14 }).map((_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: -100,
                right: -100,
                top: 40 + i * 96 + (i % 3) * 14,
                height: 2 + (i % 3),
                background: "rgba(40,20,5,0.22)",
                transform: `rotate(-6deg)`,
                borderRadius: 2,
              }}
            />
          ))}
          <div style={{ position: "absolute", left: 40 + (SCREEN_W - plateSize) / 2, top: 40 + plateTop }}>
            <Plate size={plateSize} />
          </div>
          {/* warm window light */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(200deg, rgba(255,225,180,0.28) 0%, rgba(255,225,180,0) 45%)",
            }}
          />
        </div>
      </div>

      {/* Viewfinder chrome (hidden once captured) */}
      <div style={{ position: "absolute", inset: 0, opacity: captured ? 1 - snap : 1 }}>
        {/* top label */}
        <div
          style={{
            position: "absolute",
            top: 92,
            width: "100%",
            textAlign: "center",
            fontFamily: FONT.body,
            fontWeight: 800,
            fontSize: 20,
            letterSpacing: 3,
            color: "#F6D35B",
          }}
        >
          PHOTO
        </div>
        {/* corner brackets */}
        {[
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ].map(([x, y]) => (
          <div
            key={`${x}${y}`}
            style={{
              position: "absolute",
              left: x ? undefined : 34,
              right: x ? 34 : undefined,
              top: y ? undefined : 150,
              bottom: y ? 250 : undefined,
              width: 44,
              height: 44,
              borderColor: "rgba(255,255,255,0.85)",
              borderStyle: "solid",
              borderWidth: 0,
              borderTopWidth: y ? 0 : 4,
              borderBottomWidth: y ? 4 : 0,
              borderLeftWidth: x ? 0 : 4,
              borderRightWidth: x ? 4 : 0,
              borderRadius: 6,
            }}
          />
        ))}
        {/* autofocus square */}
        <div
          style={{
            position: "absolute",
            left: SCREEN_W / 2 - 90,
            top: plateTop + plateSize / 2 - 90 + 10,
            width: 180,
            height: 180,
            border: `3px solid ${focusLocked ? "#8FD07A" : "#F6D35B"}`,
            borderRadius: 14,
            opacity: focusIn * focusOut,
            transform: `scale(${interpolate(focusIn, [0, 1], [1.5, 1])})`,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
          }}
        />
        {/* bottom controls */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 220,
            background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 60%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: SCREEN_W / 2 - 46,
            bottom: 72,
            width: 92,
            height: 92,
            borderRadius: "50%",
            border: "5px solid #fff",
            display: "grid",
            placeItems: "center",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "#fff",
              transform: `scale(${press})`,
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            left: 48,
            bottom: 92,
            width: 52,
            height: 52,
            borderRadius: 12,
            background: "rgba(255,255,255,0.18)",
            border: "2px solid rgba(255,255,255,0.5)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 48,
            bottom: 92,
            width: 52,
            height: 52,
            borderRadius: "50%",
            border: "3px solid rgba(255,255,255,0.7)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <div style={{ width: 20, height: 20, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.7)" }} />
        </div>
      </div>

      {/* After capture: the app's "Chompy is looking…" wait state */}
      {captured && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 96,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
            opacity: interpolate(snap, [0.3, 1], [0, 1], { extrapolateLeft: "clamp" }),
            transform: `translateY(${(1 - snap) * 30}px)`,
          }}
        >
          <div
            style={{
              fontFamily: FONT.display,
              fontSize: 40,
              color: C.white,
              textShadow: "0 2px 10px rgba(0,0,0,0.4)",
            }}
          >
            Chompy is looking…
          </div>
          <div style={{ width: 240, height: 14, borderRadius: 99, background: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
            <div
              style={{
                width: "45%",
                height: "100%",
                borderRadius: 99,
                background: C.sage,
                transform: `translateX(${interpolate((g - SNAP.captured) % 33, [0, 33], [-110, 245])}px)`,
              }}
            />
          </div>
        </div>
      )}

      {/* Flash */}
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
      <AbsoluteFill
        style={{
          background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 22%)",
          opacity: captured ? 1 - snap : 1,
        }}
      />
    </AbsoluteFill>
  );
};

export const SnapCaptions = () => (
  <Caption
    from={6}
    to={SCENES.snap.to}
    tone="light"
    lines={[
      { text: "Keeping track of what your child eats", size: 42, weight: 700, muted: true },
      { text: "is as easy as a photo.", size: 72 },
    ]}
    accent={["photo"]}
  />
);
