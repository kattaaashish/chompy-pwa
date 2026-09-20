// Root — one screen at a time. Onboarding owns the flow until `home`; from there
// the food-logging state machine takes over (or Home shows when idle). Mirrors
// lib/main.dart's _Root.

import { useEffect } from "react";
import { useStore } from "./store";
import { LoadingView } from "./components";
import { S } from "./strings";

import { WelcomeScreen } from "./screens/Welcome";
import { PhoneScreen } from "./screens/Phone";
import { OtpScreen } from "./screens/Otp";
import { ProfileScreen } from "./screens/Profile";
import { HomeScreen } from "./screens/Home";
import { ModeScreen } from "./screens/food/Mode";
import { TypeScreen } from "./screens/food/Type";
import { CancelledScreen } from "./screens/food/Cancelled";
import { ReviewScreen } from "./screens/food/Review";
import { FactScreen } from "./screens/food/Fact";
import { SavedScreen } from "./screens/food/Saved";
import { FailedScreen } from "./screens/food/Failed";

export function App() {
  const s = useStore();

  // Resume a previous session before the first meaningful frame.
  useEffect(() => {
    if (s.screen === "restoring") void s.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (s.screen !== "home") {
    switch (s.screen) {
      case "restoring":
        return <LoadingView title="…" />;
      case "welcome":
        return <WelcomeScreen />;
      case "phone":
        return <PhoneScreen />;
      case "sending":
        return <LoadingView title={S.sendingTitle} body={S.sendingBody(s.phone)} />;
      case "otp":
        return <OtpScreen />;
      case "verifying":
        return <LoadingView title={S.verifyingTitle} body={S.verifyingBody} />;
      case "profile":
        return <ProfileScreen />;
    }
  }

  // Home reached — food flow or idle Home.
  switch (s.food) {
    case "none":
      return <HomeScreen />;
    case "mode":
      return <ModeScreen />;
    case "text":
      return <TypeScreen />;
    case "cancelled":
      return <CancelledScreen />;
    case "detecting":
      return <LoadingView title={S.detectingTitle} body={S.detectingBody} />;
    case "review":
      return <ReviewScreen />;
    case "saving":
      return <LoadingView title={S.savingTitle} body={S.savingBody} />;
    case "fact":
      return <FactScreen />;
    case "saved":
      return <SavedScreen />;
    case "failed":
      return <FailedScreen />;
    default:
      return <HomeScreen />;
  }
}
