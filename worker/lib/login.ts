// Phone + OTP login, shared by the app's /api/auth/verify-otp and the MCP OAuth
// authorization page. Verifies the code (master OTP / dev bypass / KV
// challenge), then finds-or-creates the account. Pure logic — no HTTP.

import { eq } from "drizzle-orm";
import type { Env } from "./env";
import { db } from "../db/client";
import { profiles } from "../db/schema";
import { isValidOtpFormat, isValidPhone } from "../../shared/validation";
import {
  DEBUG_BYPASS_CODE,
  consumeChallenge,
  debugEnabled,
  isMasterOtp,
  verifyChallenge,
} from "./otp";

export type LoginResult =
  | { ok: true; userId: string; isProfileComplete: boolean }
  | { ok: false; code: "invalid_phone" | "code_invalid" | "server_error"; message: string };

export async function loginWithOtp(env: Env, phone: unknown, code: unknown): Promise<LoginResult> {
  if (!isValidPhone(phone)) {
    return { ok: false, code: "invalid_phone", message: "Enter a valid 10-digit number." };
  }
  if (!isValidOtpFormat(code)) {
    return { ok: false, code: "code_invalid", message: "Enter the 6-digit code." };
  }

  // Bypass the code check when: (a) the configured master OTP is entered (works
  // in any environment), or (b) OTP_DEBUG is on and the dev master code is used.
  const bypass = isMasterOtp(env, code) || (debugEnabled(env) && code === DEBUG_BYPASS_CODE);
  let hadChallenge = false;

  if (!bypass) {
    const { ok, existed } = await verifyChallenge(env, phone, code);
    hadChallenge = existed;
    if (!existed) {
      // Missing = never sent OR expired (KV TTL removed it). One message covers both.
      return {
        ok: false,
        code: "code_invalid",
        message: "That code isn't valid. Re-enter your number to get a new one.",
      };
    }
    if (!ok) return { ok: false, code: "code_invalid", message: "That code is incorrect." };
  }

  const database = db(env);

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
      return { ok: false, code: "server_error", message: "Could not create account." };
    }
  }

  // Consume the challenge only once the account is settled (nothing to consume on bypass).
  if (hadChallenge) await consumeChallenge(env, phone);

  return { ok: true, userId, isProfileComplete };
}
