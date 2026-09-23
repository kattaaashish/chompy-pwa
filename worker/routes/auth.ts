// Account registration — phone -> OTP -> session. Ported from the Supabase
// auth-request-otp / auth-verify-otp / session-state edge functions. The account
// is created only after a code verifies (worker/lib/login.ts, shared with the
// MCP OAuth login page). Session is a self-issued JWT.

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Env, Vars } from "../lib/env";
import { apiError } from "../lib/http";
import { optionalUserId, signToken } from "../lib/auth";
import { db } from "../db/client";
import { profiles } from "../db/schema";
import { isValidPhone } from "../../shared/validation";
import { debugEnabled, generateCode, sendOtp, storeChallenge } from "../lib/otp";
import { loginWithOtp } from "../lib/login";

export const auth = new Hono<{ Bindings: Env; Variables: Vars }>();

// Stage 1 — request a code. No account is created here.
auth.post("/auth/request-otp", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const phone = body?.phone;
  if (!isValidPhone(phone)) {
    return apiError(c, "invalid_phone", "Enter a valid 10-digit mobile number.", 400);
  }

  const code = generateCode();
  try {
    await storeChallenge(c.env, phone, code);
  } catch (_e) {
    return apiError(c, "server_error", "Could not generate a code.", 500, { retryable: true });
  }

  const sent = sendOtp(phone, code);
  if (!sent.ok) {
    return apiError(c, "otp_send_failed", "Couldn't send the code. Please try again.", 502, {
      retryable: true,
    });
  }

  const resp: Record<string, unknown> = { status: "otp_sent" };
  if (debugEnabled(c.env)) resp.debugCode = code; // dev only
  return c.json(resp);
});

// Stage 2 — verify the code, create/reuse the account, mint a session.
auth.post("/auth/verify-otp", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = await loginWithOtp(c.env, body?.phone, body?.code);
  if (!result.ok) {
    const status = result.code === "server_error" ? 500 : 400;
    return apiError(c, result.code, result.message, status, {
      ...(result.code === "server_error" ? { retryable: true } : {}),
    });
  }

  const accessToken = await signToken(c.env, result.userId);
  const nextStage = result.isProfileComplete ? "home" : "profile";
  return c.json({ status: "verified", nextStage, session: { access_token: accessToken } });
});

// Resume — the stage the app should land on, from server truth.
auth.post("/session-state", async (c) => {
  const userId = await optionalUserId(c);
  if (!userId) return c.json({ stage: "phone" });

  const profile = await db(c.env)
    .select({ isVerified: profiles.isVerified, isProfileComplete: profiles.isProfileComplete })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .get();

  if (!profile || !profile.isVerified) return c.json({ stage: "phone" });
  return c.json({ stage: profile.isProfileComplete ? "home" : "profile" });
});
