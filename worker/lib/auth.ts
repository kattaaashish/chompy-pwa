// Session auth — JWT (HS256, jose) signed with the JWT_SECRET worker secret.
// Replaces Supabase Auth: a single self-issued token identifies the account.
// Family-only app, so one long-lived token (30 days) — no refresh dance.

import { SignJWT, jwtVerify } from "jose";
import type { Context, MiddlewareHandler } from "hono";
import type { Env, Vars } from "./env";
import { apiError } from "./http";

const ISSUER = "chompy";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secretKey(env: Env): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function signToken(env: Env, userId: string): Promise<string> {
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secretKey(env));
}

export async function verifyToken(env: Env, token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(env), { issuer: ISSUER });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function bearer(c: Context): string | null {
  const h = c.req.header("Authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

// Require a valid session; sets `userId` on the context or 401s.
export const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (
  c,
  next,
) => {
  const token = bearer(c);
  const userId = token ? await verifyToken(c.env, token) : null;
  if (!userId) return apiError(c, "unauthorized", "Sign in first.", 401);
  c.set("userId", userId);
  await next();
};

// Optional session — sets userId when present, never blocks (for session-state).
export async function optionalUserId(
  c: Context<{ Bindings: Env; Variables: Vars }>,
): Promise<string | null> {
  const token = bearer(c);
  return token ? await verifyToken(c.env, token) : null;
}
