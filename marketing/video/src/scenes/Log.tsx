import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Caption } from "../components/Caption";
import { Clip, Cover, Screen, Shot, Tap, layout, type Box } from "../components/Phone";
import { SCENES, SCREEN_XFADE } from "../timing";

// Beats (global)
export const LOG = {
  reviewFrom: SCENES.log.from - 6,
  homeFrom: 256,
  captionSplit: 258,
};

// A card region of a shot that springs into place (from slightly below and
// smaller), hiding the original until it lands.
const PopIn = ({
  name,
  box,
  scroll,
  at,
  radius = 26 * 1.374,
  pad = 6,
}: {
  name: string;
  box: Box;
  scroll: number;
  at: number; // local frame the card appears
  radius?: number;
  pad?: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 15, stiffness: 130, mass: 0.8 } });
  if (frame < at) return <Cover box={box} scroll={scroll} pad={pad} />;
  return (
    <>
      <Cover box={box} scroll={scroll} pad={pad} />
      <Clip
        name={name}
        box={box}
        scroll={scroll}
        pad={pad}
        radius={radius}
        style={{
          opacity: s,
          transform: `translateY(${(1 - s) * 40}px) scale(${0.94 + s * 0.06})`,
          transformOrigin: "50% 60%",
        }}
      />
    </>
  );
};

const ReviewScreen = () => {
  const frame = useCurrentFrame();
  // Scroll down a little once the items have landed so the CTA comes into view.
  const scroll = interpolate(frame, [56, 96], [0, 178], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const items = layout.review.items;
  const last = items[items.length - 1];
  // Everything under the item list ("Add something I missed", the CTA) waits
  // until the last item has landed, then fades up.
  const tailAt = 14 + (items.length - 1) * 11 + 10;
  const tail = { x: 0, y: last.box.y + last.box.h + 6, w: 393, h: layout.review.docHeight };
  const tailO = interpolate(frame, [tailAt, tailAt + 12], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <>
      <Shot name="review-full" scroll={scroll} />
      {items.map((it, i) => (
        <PopIn key={it.label} name="review-full" box={it.box} scroll={scroll} at={14 + i * 11} />
      ))}
      {tailO > 0 && <Cover box={tail} scroll={scroll} style={{ opacity: tailO }} />}
      <Tap box={layout.review.cta} scroll={scroll} frame={frame - 100} />
    </>
  );
};

const HomeScreen = () => {
  const frame = useCurrentFrame();
  const scroll = interpolate(frame, [0, 30], [440, 560], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const meals = layout.homeLunchOpen.meals;
  return (
    <>
      <Shot name="home-lunch-open" scroll={scroll} />
      {meals.map((m, i) => (
        <PopIn key={m.label} name="home-lunch-open" box={m.box} scroll={scroll} at={16 + i * 13} />
      ))}
    </>
  );
};

export const LogScreens = () => (
  <>
    <Screen from={LOG.reviewFrom} to={LOG.homeFrom + SCREEN_XFADE}>
      <ReviewScreen />
    </Screen>
    <Screen from={LOG.homeFrom} to={SCENES.nutrition.from + SCREEN_XFADE}>
      <HomeScreen />
    </Screen>
  </>
);

export const LogCaptions = () => (
  <>
    <Caption
      from={SCENES.log.from}
      to={LOG.captionSplit}
      lines={[{ text: "They snap it. You snap it.", size: 70 }]}
      accent={["snap"]}
    />
    <Caption
      from={LOG.captionSplit}
      to={SCENES.log.to}
      lines={[{ text: "Chompy keeps the whole day together.", size: 64 }]}
      accent={["together"]}
    />
  </>
);
