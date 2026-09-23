import { loadFont as loadNunito } from "@remotion/google-fonts/Nunito";
import { loadFont as loadCaprasimo } from "@remotion/google-fonts/Caprasimo";

const nunito = loadNunito("normal", { weights: ["600", "700", "800", "900"], subsets: ["latin"] });
const caprasimo = loadCaprasimo("normal", { weights: ["400"], subsets: ["latin"] });

export const FONT = {
  body: `${nunito.fontFamily}, system-ui, sans-serif`,
  display: `${caprasimo.fontFamily}, Georgia, serif`,
};

// Brand palette — the icon's terracotta + cream, plus the app's own tokens
// (src/theme.css) so overlays match the screenshots exactly.
export const C = {
  terracotta: "#C1703C",
  accent: "#C67139",
  accentLight: "#D9A273",
  accentDeep: "#8C491A",
  cream: "#F0E6D2",
  ground: "#F9F4ED",
  surface: "#EBDDC5",
  ink: "#3A2A1E",
  inkApp: "#201E1D",
  sage: "#8FA073",
  sageDeep: "#56633F",
  sageTint: "#F0FAE1",
  neutral300: "#DCD3C4",
  neutral700: "#645C50",
  white: "#FFFDF9",
};
