// Claude Messages API client. Ported from the Supabase Edge function, but the
// API key + model are injected (Workers has no global env) via createLlm().
// Every call uses structured JSON output (output_config.format) so the first
// text block is guaranteed-parseable JSON — no prose to strip.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
export const DEFAULT_MODEL = "claude-opus-4-8";

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

      let res: Response;
      try {
        res = await fetch(ANTHROPIC_API_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model: resolvedModel,
            max_tokens: opts.maxTokens ?? 2048,
            system: opts.system,
            messages: [{ role: "user", content: opts.content }],
            output_config: {
              effort: "low",
              format: { type: "json_schema", schema: opts.schema },
            },
          }),
        });
      } catch (_e) {
        throw new LlmError("Couldn't reach the nutrition service.", true);
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error(`[llm] ${res.status}: ${detail}`);
        const retryable = res.status === 429 || res.status >= 500;
        throw new LlmError("The nutrition service failed.", retryable);
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
    },
  };
}
