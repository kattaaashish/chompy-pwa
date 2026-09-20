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
  CHOMPY_LLM_MODEL?: string;
}

// Hono context variables set by middleware.
export interface Vars {
  userId: string;
}
