import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { AUDIO } from "./audio-manifest";
import { Background } from "./components/Background";
import { Brand } from "./components/Brand";
import { Phone } from "./components/Phone";
import { AskCaptions, AskOverlays, AskScreens } from "./scenes/Ask";
import { LogCaptions, LogScreens } from "./scenes/Log";
import { LogoScene } from "./scenes/Logo";
import { NutritionCaptions, NutritionOverlays, NutritionScreens } from "./scenes/Nutrition";
import { SNAP, SnapCaptions, SnapScreens } from "./scenes/Snap";
import { SCENES } from "./timing";

// One phone persists through the four product scenes; only its screen changes
// (each scene pushes its own real screenshot in). It bows out for the logo.
const PhoneRig = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 90, mass: 1.1 } });
  const exit = spring({ frame: frame - (SCENES.logo.from - 8), fps, config: { damping: 20, stiffness: 110 } });
  const scale = interpolate(enter, [0, 1], [0.92, 1]) * interpolate(exit, [0, 1], [1, 0.9]);
  const y = interpolate(enter, [0, 1], [70, 0]) + interpolate(exit, [0, 1], [0, 80]);
  const opacity = Math.min(enter * 1.4, 1) * (1 - exit);
  // Idle breathing so the phone never feels frozen.
  const sway = Math.sin(frame * 0.045) * 0.35;
  if (opacity <= 0) return null;
  const cameraOn = frame >= SNAP.cameraFrom + 8 && frame < SCENES.log.from;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `translateY(${y}px) scale(${scale}) rotate(${sway}deg)`,
        transformOrigin: "50% 45%",
        opacity,
      }}
    >
      <Phone lightStatus={cameraOn}>
        <SnapScreens />
        <LogScreens />
        <NutritionScreens />
        <AskScreens />
      </Phone>
    </div>
  );
};

const VO = ({ name, from }: { name: keyof typeof AUDIO; from: number }) =>
  AUDIO[name] ? (
    <Sequence from={from} layout="none">
      <Audio src={staticFile(`audio/${name}.mp3`)} volume={1} />
    </Sequence>
  ) : null;

export const ChompyAd = () => (
  <AbsoluteFill style={{ background: "#C1703C" }}>
    <Background />
    <Brand />
    <PhoneRig />

    <NutritionOverlays />
    <AskOverlays />

    <SnapCaptions />
    <LogCaptions />
    <NutritionCaptions />
    <AskCaptions />

    <LogoScene />

    {/* Audio: music bed under the voiceover; each VO starts on its scene's
        first frame. Files land in public/audio/ (see tools/audio-manifest.mjs). */}
    {AUDIO.music && (
      <Audio
        src={staticFile("audio/music.mp3")}
        // 20% bed under the VO; 1s fade-in, 2s fade-out so it resolves under the logo.
        volume={(f) =>
          interpolate(f, [0, 30, 840, 900], [0, 0.2, 0.2, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />
    )}
    <VO name="vo-1-snap" from={SCENES.snap.from} />
    <VO name="vo-2-log" from={SCENES.log.from} />
    <VO name="vo-3-nutrition" from={SCENES.nutrition.from} />
    <VO name="vo-4-ask" from={SCENES.ask.from} />
    <VO name="vo-5-logo" from={SCENES.logo.from} />
  </AbsoluteFill>
);
