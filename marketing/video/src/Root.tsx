import { Composition } from "remotion";
import { ChompyAd } from "./ChompyAd";
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from "./timing";

export const Root = () => (
  <Composition
    id="ChompyAd"
    component={ChompyAd}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);
