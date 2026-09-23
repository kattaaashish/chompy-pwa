import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AppIcon } from "../components/Brand";
import { Caption } from "../components/Caption";
import { Clip, Cover, Screen, Tap, boxStyle, layout, px } from "../components/Phone";
import { C, FONT } from "../theme";
import { SCENES, SCREEN_XFADE, WIDTH } from "../timing";

// Beats (global)
export const ASK = {
  from: SCENES.ask.from - 6,
  question: 612, // parent's bubble
  tap: 636, // tap "Get tonight's dinner idea"
  thinking: 644, // button reads "Thinking of ideas…", typing dots outside
  answer: 692, // idea card expands + answer bubble
  highlight: 740, // ring the two suggestions the answer named
};

const ask = layout.homeAsk.askButton;
const idea = layout.homeIdea.idea;
const rows = layout.homeIdea.rows;
const DOC_H = layout.homeIdea.docHeight;
const DELTA = idea.h - ask.h; // how far the content below shifts down

// Home, built from the three real captures so the "Tonight's idea" card can
// grow out of the button and push the rest of the page down, like the live UI.
const HomeAskScreen = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const g = frame + ASK.from;
  const p = spring({ frame: g - ASK.answer, fps, config: { damping: 18, stiffness: 90, mass: 1 } });
  const thinking = interpolate(g, [ASK.thinking, ASK.thinking + 5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const top = { x: 0, y: 0, w: 393, h: idea.y };
  const bottom = { x: 0, y: idea.y + idea.h, w: 393, h: DOC_H - (idea.y + idea.h) };

  return (
    <>
      {/* page above the card */}
      <Clip name="home-idea" box={top} />
      {/* the card, growing */}
      <div style={{ ...boxStyle({ ...idea, h: idea.h * Math.max(p, 0.001) }), overflow: "hidden", borderRadius: px(26), opacity: p > 0 ? 1 : 0 }}>
        <Clip name="home-idea" box={idea} style={{ left: 0, top: 0 }} />
        {rows.map((r, i) => {
          const o = interpolate(p, [0.35 + i * 0.12, 0.6 + i * 0.12], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <Cover
              key={r.label}
              box={{ ...r.box, x: r.box.x - idea.x, y: r.box.y - idea.y }}
              pad={4}
              color={C.sageTint}
              style={{ opacity: o, top: px(r.box.y - idea.y) - px(4) }}
            />
          );
        })}
      </div>
      {/* page below the card, pushed down as it grows */}
      <Clip name="home-idea" box={bottom} style={{ transform: `translateY(${-px(DELTA) * (1 - p)}px)` }} />
      {/* the button (idle → thinking), fading out as the card takes over */}
      <div style={{ opacity: 1 - Math.min(1, p * 4) }}>
        <Clip name="home-ask" box={ask} pad={2} />
        <Clip name="home-thinking" box={ask} pad={2} style={{ opacity: thinking }} />
      </div>
      <Tap box={ask} frame={g - ASK.tap} />

      {/* ring the suggestions the answer named */}
      {[0, 2].map((i) => {
        const r = rows[i];
        const s = spring({ frame: g - (ASK.highlight + i * 4), fps, config: { damping: 14, stiffness: 120 } });
        return (
          <div
            key={i}
            style={{
              ...boxStyle({ x: r.box.x - 10, y: r.box.y - 6, w: r.box.w + 20, h: r.box.h + 10 }),
              borderRadius: 18,
              border: `3px solid ${C.terracotta}`,
              boxShadow: "0 0 0 6px rgba(198,113,57,0.14)",
              opacity: s,
              transform: `scale(${interpolate(s, [0, 1], [1.08, 1])})`,
            }}
          />
        );
      })}
    </>
  );
};

export const AskScreens = () => (
  <Screen from={ASK.from} to={SCENES.logo.from + SCREEN_XFADE}>
    <HomeAskScreen />
  </Screen>
);

const Bubble = ({
  at,
  side,
  children,
  top,
  bg,
  color,
  width,
  label,
}: {
  at: number;
  side: "left" | "right";
  children: React.ReactNode;
  top: number;
  bg: string;
  color: string;
  width: number;
  label?: string;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 14, stiffness: 140, mass: 0.8 } });
  if (frame < at) return null;
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: side === "left" ? 72 : undefined,
        right: side === "right" ? 72 : undefined,
        maxWidth: width,
        opacity: s,
        transform: `translateY(${(1 - s) * 30}px) scale(${interpolate(s, [0, 1], [0.85, 1])})`,
        transformOrigin: side === "left" ? "0% 100%" : "100% 100%",
      }}
    >
      {label && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 10,
            marginLeft: 6,
            fontFamily: FONT.display,
            fontSize: 26,
            color: C.ink,
          }}
        >
          <AppIcon size={34} shadow={false} /> {label}
        </div>
      )}
      <div
        style={{
          background: bg,
          color,
          padding: "26px 34px",
          borderRadius: 34,
          borderBottomLeftRadius: side === "left" ? 10 : 34,
          borderBottomRightRadius: side === "right" ? 10 : 34,
          fontFamily: FONT.body,
          fontWeight: 700,
          fontSize: 37,
          lineHeight: 1.28,
          boxShadow: "0 22px 50px rgba(90,40,10,0.22)",
        }}
      >
        {children}
      </div>
    </div>
  );
};

const Typing = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", gap: 12, padding: "6px 4px" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: C.accentLight,
            transform: `translateY(${Math.sin((frame - i * 4) * 0.45) * -6}px)`,
            opacity: 0.6 + Math.sin((frame - i * 4) * 0.45) * 0.4,
          }}
        />
      ))}
    </div>
  );
};

export const AskOverlays = () => {
  const frame = useCurrentFrame();
  if (frame < ASK.question || frame >= SCENES.logo.from) return null;
  const out = interpolate(frame, [SCENES.logo.from - 14, SCENES.logo.from - 2], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ position: "absolute", inset: 0, opacity: out }}>
      <Bubble at={ASK.question} side="right" top={950} width={640} bg={C.terracotta} color="#FFF8EE">
        What's missing from Aarav's day?
      </Bubble>
      {frame < ASK.answer ? (
        <Bubble at={ASK.thinking} side="left" top={1130} width={200} bg={C.white} color={C.ink} label="Chompy">
          <Typing />
        </Bubble>
      ) : (
        <Bubble at={ASK.answer} side="left" top={1100} width={WIDTH - 200} bg={C.white} color={C.ink} label="Chompy">
          Iron and vitamin A are a bit low today. Add{" "}
          <span style={{ color: C.terracotta, fontWeight: 900 }}>palak dal</span> or{" "}
          <span style={{ color: C.terracotta, fontWeight: 900 }}>paneer bhurji</span> tonight.
        </Bubble>
      )}
    </div>
  );
};

export const AskCaptions = () => (
  <Caption
    from={SCENES.ask.from}
    to={SCENES.ask.to}
    lines={[
      { text: "Not sure what's missing?", size: 50, weight: 700, muted: true },
      { text: "Just ask.", size: 84 },
    ]}
    accent={["ask"]}
  />
);
