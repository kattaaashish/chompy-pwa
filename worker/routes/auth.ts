// Account registration — phone -> OTP -> session. Ported from the Supabase
// auth-request-otp / auth-verify-otp / session-state edge functions. The account
// is created only after a code verifies. Session is a self-issued JWT.

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Env, Vars } from "../lib/env";
import { apiError } from "../lib/http";
import { optionalUserId, signToken } from "../lib/auth";
import { db } from "../db/client";
import { profiles } from "../db/schema";
import { isValidOtpFormat, isValidPhone } from "../../shared/validation";
import {
  DEBUG_BYPASS_CODE,
  consumeChallenge,
  debugEnabled,
  generateCode,
  isMasterOtp,
  sendOtp,
  storeChallenge,
  verifyChallenge,
} from "../lib/otp";

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
  const phone = body?.phone;
  const code = body?.code;

  if (!isValidPhone(phone)) {
    return apiError(c, "invalid_phone", "Enter a valid 10-digit number.", 400);
  }
  if (!isValidOtpFormat(code)) {
    return apiError(c, "code_invalid", "Enter the 6-digit code.", 400);
  }

  // Bypass the code check when: (a) the configured master OTP is entered (works
  // in any environment), or (b) OTP_DEBUG is on and the dev master code is used.
  const bypass =
    isMasterOtp(c.env, code) || (debugEnabled(c.env) && code === DEBUG_BYPASS_CODE);
  let hadChallenge = false;

  if (!bypass) {
    const { ok, existed } = await verifyChallenge(c.env, phone, code);
    hadChallenge = existed;
    if (!existed) {
      // Missing = never sent OR expired (KV TTL removed it). One message covers both.
      return apiError(
        c,
        "code_invalid",
        "That code isn't valid. Re-enter your number to get a new one.",
        400,
      );
    }
    if (!ok) return apiError(c, "code_invalid", "That code is incorrect.", 400);
  }

  const database = db(c.env);

  // Find-or-create the account by phone. New number -> create now; returning -> reuse.
  const existing = await database
    .select({ id: profiles.id, isProfileComplete: profiles.isProfileComplete })
    .from(profiles)
    .where(eq(profiles.phone, phone))
    .get();

  let userId: string;
  let isProfileComplete = false;

  if (existing) {
    userId = existing.id;
    isProfileComplete = existing.isProfileComplete;
  } else {
    userId = crypto.randomUUID();
    try {
      await database.insert(profiles).values({ id: userId, phone, isVerified: true }).run();
    } catch (_e) {
      return apiError(c, "server_error", "Could not create account.", 500, { retryable: true });
    }
  }

  // Consume the challenge only once the account is settled (nothing to consume on bypass).
  if (hadChallenge) await consumeChallenge(c.env, phone);

  const accessToken = await signToken(c.env, userId);
  const nextStage = isProfileComplete ? "home" : "profile";
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
