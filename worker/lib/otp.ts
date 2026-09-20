// OTP primitives, now backed by Cloudflare KV instead of an otp_challenges
// table. Exactly one active challenge per phone: KV key `otp:<phone>` holds the
// hashed code and expires automatically (expirationTtl), so re-requesting a code
// overwrites the prior one and expiry needs no cleanup job.

import type { Env } from "./env";

export const OTP_TTL_SECONDS = 5 * 60; // 5-minute validity window

// Dev-only master code: when OTP_DEBUG=true, verifies any phone without a stored
// challenge. NEVER enable OTP_DEBUG in production.
export const DEBUG_BYPASS_CODE = "987654";

export function debugEnabled(env: Env): boolean {
  return env.OTP_DEBUG === "true";
}

// A master OTP bypasses the code check for ANY phone, regardless of OTP_DEBUG.
// Configured via the MASTER_OTP var so the value isn't baked into logic. It's a
// shared password: anyone with it + the URL can sign in as any number.
export function isMasterOtp(env: Env, code: string): boolean {
  const master = env.MASTER_OTP;
  return typeof master === "string" && master.length > 0 && code === master;
}

export function generateCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

// Salt with phone + server pepper so a leaked value can't be reversed.
export async function hashCode(env: Env, phone: string, code: string): Promise<string> {
  const pepper = env.OTP_PEPPER ?? "";
  const data = new TextEncoder().encode(`${phone}:${code}:${pepper}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function key(phone: string): string {
  return `otp:${phone}`;
}

// Store a fresh challenge, replacing any prior one for this phone.
export async function storeChallenge(env: Env, phone: string, code: string): Promise<void> {
  const codeHash = await hashCode(env, phone, code);
  await env.OTP_KV.put(key(phone), codeHash, { expirationTtl: OTP_TTL_SECONDS });
}

// Compare a submitted code to the stored hash. Missing (expired/never sent) => false.
export async function verifyChallenge(
  env: Env,
  phone: string,
  code: string,
): Promise<{ ok: boolean; existed: boolean }> {
  const stored = await env.OTP_KV.get(key(phone));
  if (!stored) return { ok: false, existed: false };
  const candidate = await hashCode(env, phone, code);
  return { ok: candidate === stored, existed: true };
}

export async function consumeChallenge(env: Env, phone: string): Promise<void> {
  await env.OTP_KV.delete(key(phone));
}

// Stubbed SMS delivery. Real integration comes later; dev echoes the code.
export function sendOtp(phone: string, code: string): { ok: boolean } {
  console.log(`[otp:stub] would send code ${code} to ${phone}`);
  return { ok: true };
}
