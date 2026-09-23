// Session auth — JWT (HS256, jose) signed with the JWT_SECRET worker secret.
// Replaces Supabase Auth: a single self-issued token identifies the account.
// Family-only app, so one long-lived token (30 days) — no refresh dance.
//
// Audiences: tokens minted for the app carry no `aud`; tokens minted by the MCP
// OAuth flow carry aud "mcp". The app API (`requireAuth`) rejects "mcp" tokens
// so a token handed to an external AI harness can only ever read via /mcp, not
// write via /api. The MCP endpoint accepts both (your own app token works too).

import { SignJWT, jwtVerify } from "jose";
import type { Context, MiddlewareHandler } from "hono";
import type { Env, Vars } from "./env";
import { apiError } from "./http";

const ISSUER = "chompy";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const TOKEN_TTL_SECONDS = TTL_SECONDS;

export const MCP_AUDIENCE = "mcp";

function secretKey(env: Env): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function signToken(
  env: Env,
  userId: string,
  opts: { audience?: string } = {},
): Promise<string> {
  let jwt = new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`);
  if (opts.audience) jwt = jwt.setAudience(opts.audience);
  return await jwt.sign(secretKey(env));
}

export interface TokenClaims {
  userId: string;
  audience: string[];
}

// Verify signature/issuer/expiry and return the claims we care about.
export async function verifyTokenClaims(env: Env, token: string): Promise<TokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(env), { issuer: ISSUER });
    if (typeof payload.sub !== "string") return null;
    const aud = payload.aud;
    const audience = Array.isArray(aud) ? aud : typeof aud === "string" ? [aud] : [];
    return { userId: payload.sub, audience };
  } catch {
    return null;
  }
}

// App-facing verification: any valid token that is NOT an MCP (read-only) token.
export async function verifyToken(env: Env, token: string): Promise<string | null> {
  const claims = await verifyTokenClaims(env, token);
  if (!claims || claims.audience.includes(MCP_AUDIENCE)) return null;
  return claims.userId;
}

export function bearer(c: Context): string | null {
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
