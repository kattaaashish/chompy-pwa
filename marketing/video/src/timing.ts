// Frame plan for the 30s ad (30fps). Scene boundaries are fixed by the script;
// screen/overlay beats inside a scene are listed here so every file agrees.
export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const TOTAL_FRAMES = 900;

export const SCENES = {
  snap: { from: 0, to: 150 },
  log: { from: 150, to: 360 },
  nutrition: { from: 360, to: 600 },
  ask: { from: 600, to: 780 },
  logo: { from: 780, to: 900 },
} as const;

// How long two adjacent screens overlap while the newer one pushes in.
export const SCREEN_XFADE = 14;

// Phone geometry. Screens are iPhone 14 Pro shots (393x852 CSS px @3x), shown
// at SCREEN_W wide, so 1 CSS px of the app == K px of the video.
export const SCREEN_W = 540;
export const SCREEN_H = 1170;
export const K = SCREEN_W / 393;
export const BEZEL = 14;
// Shots are captured with no status bar; push them down under the phone's
// island/status bar the way the safe-area inset does on a real iPhone.
export const STATUS_PAD = 76;
export const PHONE_TOP = 168;
export const PHONE_LEFT = (WIDTH - SCREEN_W) / 2;

// Lower caption band (bottom ~25%).
export const BAND_TOP = 1450;
export const BAND_H = 360;
