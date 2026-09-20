// Structured error envelope — same contract the app already branches on:
//   { error: { code, message, fieldErrors?, retryable? } }
import type { Context } from "hono";

export function apiError(
  c: Context,
  code: string,
  message: string,
  status: number,
  extra?: { fieldErrors?: Record<string, unknown>; retryable?: boolean },
): Response {
  return c.json({ error: { code, message, ...extra } }, status as never);
}
