import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Caption } from "../components/Caption";
import { Clip, Cover, Screen, Shot, boxStyle, layout, px } from "../components/Phone";
import { C, FONT } from "../theme";
import { PHONE_LEFT, PHONE_TOP, SCENES, SCREEN_W, SCREEN_XFADE } from "../timing";

// Beats (global)
export const NUT = {
  from: SCENES.nutrition.from - 6,
  pills: SCENES.nutrition.from + 10, // family pills start bouncing in
  scroll: SCENES.nutrition.from + 82, // scroll down to Nutrition today
  bars: SCENES.nutrition.from + 112, // bars start filling
  cap2: 450,
  cap3: 530,
};

const SCROLL_TO = 640; // CSS px: "Nutrition today" heading near the top

const MyFoodScreen = () => {
  const frame = useCurrentFrame(); // local; 0 == NUT.from
  const { fps } = useVideoConfig();
  const g = frame + NUT.from;
  const scroll = interpolate(g, [NUT.scroll, NUT.scroll + 34], [0, SCROLL_TO], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const { families, bars } = layout.myfoodToday;

  return (
    <>
      <Shot name="myfood-today-full" scroll={scroll} />

      {/* "Eaten today" pills bounce in one by one */}
      {families.map((f, i) => {
        const s = spring({ frame: g - (NUT.pills + i * 8), fps, config: { damping: 11, stiffness: 190, mass: 0.6 } });
        return (
          <div key={f.label}>
            <Cover box={f.pill} scroll={scroll} pad={3} />
            <Clip
              name="myfood-today-full"
              box={f.pill}
              scroll={scroll}
              pad={3}
              radius={99}
              style={{ opacity: s, transform: `scale(${interpolate(s, [0, 1], [0.4, 1])})` }}
            />
          </div>
        );
      })}

      {/* Nutrient bars fill toward the daily target */}
      {bars.map((b, i) => {
        const s = spring({ frame: g - (NUT.bars + i * 6), fps, config: { damping: 20, stiffness: 70, mass: 1 } });
        const w = px(b.box.w) * (b.percent / 100) * s;
        return (
          <div key={b.label} style={{ ...boxStyle(b.box, scroll), background: C.neutral300, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ width: w, height: "100%", borderRadius: 99, background: b.color }} />
          </div>
        );
      })}
    </>
  );
};

export const NutritionScreens = () => (
  <Screen from={NUT.from} to={SCENES.ask.from + SCREEN_XFADE}>
    <MyFoodScreen />
  </Screen>
);

// A floating badge that hangs off the phone's edge while the family pills
// land, echoing the app's "All five families today" line.
export const NutritionOverlays = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const at = NUT.pills + 5 * 8 + 4;
  const s = spring({ frame: frame - at, fps, config: { damping: 13, stiffness: 150 } });
  const out = interpolate(frame, [NUT.scroll - 6, NUT.scroll + 6], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (frame < at || out <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: PHONE_LEFT + SCREEN_W - 250,
        top: PHONE_TOP + 40,
        padding: "18px 28px",
        borderRadius: 99,
        background: C.sage,
        color: "#fff",
        fontFamily: FONT.body,
        fontWeight: 800,
        fontSize: 32,
        boxShadow: "0 18px 40px rgba(60,80,30,0.35)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        opacity: s * out,
        transform: `scale(${interpolate(s, [0, 1], [0.6, 1])}) rotate(${interpolate(s, [0, 1], [-8, 4])}deg)`,
        transformOrigin: "20% 80%",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: 34 }}>✓</span> All five families
    </div>
  );
};

export const NutritionCaptions = () => (
  <>
    <Caption
      from={SCENES.nutrition.from}
      to={NUT.cap2}
      lines={[{ text: "See what they've eaten,", size: 68 }]}
      accent={["eaten"]}
    />
    <Caption
      from={NUT.cap2}
      to={NUT.cap3}
      lines={[{ text: "the nutrition they're getting,", size: 66 }]}
      accent={["nutrition"]}
    />
    <Caption
      from={NUT.cap3}
      to={SCENES.nutrition.to}
      lines={[{ text: "and how the day adds up.", size: 68 }]}
      accent={["adds", "up"]}
    />
  </>
);
