// Claude Messages API client. Ported from the Supabase Edge function, but the
// API key + model are injected (Workers has no global env) via createLlm().
// Every call uses structured JSON output (output_config.format) so the first
// text block is guaranteed-parseable JSON — no prose to strip.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
export const DEFAULT_MODEL = "claude-opus-4-8";
// Fast, low-latency model for the text-extraction and fun-fact calls.
export const DEFAULT_FAST_MODEL = "claude-haiku-4-5";

// The `effort` parameter is Opus/Sonnet-4.6 only — it 400s on Haiku 4.5 and
// Sonnet 4.5. Gate it on the model so the fast (Haiku) path doesn't error.
function supportsEffort(model: string): boolean {
  return /^claude-opus-/.test(model) || model === "claude-sonnet-4-6";
}

// Short exponential backoff with jitter between retry attempts.
function backoff(attempt: number): Promise<void> {
  const base = 250 * 2 ** (attempt - 1); // 250ms, 500ms, 1000ms
  const jitter = Math.random() * 150;
  return new Promise((r) => setTimeout(r, base + jitter));
}

// A text or image block for the user turn. Image is base64 (photo mode).
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

// Thrown on any failure to get usable JSON. `retryable` distinguishes transient
// issues (network, 429/5xx, malformed output) from permanent ones (missing key).
export class LlmError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "LlmError";
    this.retryable = retryable;
  }
}

interface GenerateJsonOptions {
  system: string;
  content: ContentBlock[];
  // JSON Schema; every object must set additionalProperties:false + required.
  schema: Record<string, unknown>;
  maxTokens?: number;
  // Reasoning depth for the call. Extraction/fact stay "low" (fast, cheap);
  // reasoning-sensitive calls (e.g. recommendations) use "high".
  effort?: "low" | "medium" | "high" | "max";
  // Enable adaptive thinking so the model reasons in thinking blocks BEFORE the
  // schema-constrained JSON — restores reasoning that structured output would
  // otherwise suppress. (Opus-tier.)
  thinking?: boolean;
}

export interface Llm {
  generateJson<T>(opts: GenerateJsonOptions): Promise<T>;
}

// Build a Claude client bound to an API key + model. Pass "" as apiKey to get a
// client that throws a non-retryable "not configured" error on first use.
export function createLlm(apiKey: string | undefined, model?: string): Llm {
  const resolvedModel = model || DEFAULT_MODEL;

  return {
    async generateJson<T>(opts: GenerateJsonOptions): Promise<T> {
      if (!apiKey) throw new LlmError("Nutrition service is not configured.", false);

      // `effort` defaults to low (fast/cheap) and is only sent on models that
      // accept it (Haiku 4.5 400s on `effort`).
      const outputConfig: Record<string, unknown> = {
        format: { type: "json_schema", schema: opts.schema },
      };
      if (supportsEffort(resolvedModel)) outputConfig.effort = opts.effort ?? "low";

      const body: Record<string, unknown> = {
        model: resolvedModel,
        max_tokens: opts.maxTokens ?? 2048,
        system: opts.system,
        messages: [{ role: "user", content: opts.content }],
        output_config: outputConfig,
      };
      // Adaptive thinking: reasoning happens in thinking blocks, unconstrained by
      // the output schema. Only meaningful on Opus-tier models.
      if (opts.thinking && supportsEffort(resolvedModel)) {
        body.thinking = { type: "adaptive" };
      }
      const requestBody = JSON.stringify(body);

      // The Workers→Anthropic egress path intermittently draws a transient
      // 403 "Request not allowed" (abuse protection on the shared egress IPs);
      // direct calls with the same key are 100% reliable. Retry transient
      // failures — network errors, 403, 429, 5xx — with short backoff.
      const MAX_ATTEMPTS = 3;
      let lastErr: LlmError | null = null;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let res: Response;
        try {
          res = await fetch(ANTHROPIC_API_URL, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": ANTHROPIC_VERSION,
            },
            body: requestBody,
          });
        } catch (_e) {
          lastErr = new LlmError("Couldn't reach the nutrition service.", true);
          await backoff(attempt);
          continue;
        }

        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          console.error(`[llm] ${resolvedModel} ${res.status} (attempt ${attempt}): ${detail}`);
          const transient = res.status === 403 || res.status === 429 || res.status >= 500;
          lastErr = new LlmError("The nutrition service failed.", transient);
          if (transient && attempt < MAX_ATTEMPTS) {
            await backoff(attempt);
            continue;
          }
          throw lastErr;
        }

        const data = (await res.json().catch(() => null)) as
          | { content?: { type: string; text?: string }[] }
          | null;
        const text = data?.content?.find((b) => b.type === "text")?.text;
        if (!text) throw new LlmError("The nutrition service returned nothing.", true);

        try {
          return JSON.parse(text) as T;
        } catch (_e) {
          throw new LlmError("The nutrition service returned malformed data.", true);
        }
      }

      // Exhausted retries on a transient error.
      throw lastErr ?? new LlmError("The nutrition service failed.", true);
    },
  };
}
