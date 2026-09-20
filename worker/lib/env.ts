// Cloudflare bindings + secrets available to the Worker. Bindings come from
// wrangler.jsonc; secrets from `wrangler secret put` (or .dev.vars locally).
export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  OTP_KV: KVNamespace;
  ASSETS: Fetcher;

  // Secrets
  ANTHROPIC_API_KEY?: string;
  JWT_SECRET: string;
  OTP_PEPPER?: string;

  // Vars
  OTP_DEBUG?: string;
  // Strong model — image extraction + all nutrition estimation (quality/vision).
  CHOMPY_LLM_MODEL?: string;
  // Fast model — text extraction + fun fact (latency-sensitive, simple tasks).
  CHOMPY_LLM_MODEL_FAST?: string;
  // A master OTP that verifies ANY phone without a real code — regardless of
  // OTP_DEBUG. Lets the family sign in while SMS is still stubbed. Anyone who
  // knows it + the URL can sign in as any number, so treat it as a shared
  // password. Unset it to disable.
  MASTER_OTP?: string;

  // Web Push (VAPID). PUBLIC is client-facing; the JWK d/x/y sign the VAPID JWT.
  VAPID_PUBLIC?: string;
  VAPID_PRIVATE_D?: string;
  VAPID_PUBLIC_X?: string;
  VAPID_PUBLIC_Y?: string;
  VAPID_SUBJECT?: string;
}

// Hono context variables set by middleware.
export interface Vars {
  userId: string;
}
