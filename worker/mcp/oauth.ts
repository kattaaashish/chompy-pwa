// OAuth 2.1 authorization server for the MCP endpoint — the piece that lets
// Claude, ChatGPT and other harnesses "Connect" to Chompy with a browser login.
//
// Flow (all standard, so any MCP client that speaks OAuth just works):
//   1. Client hits /mcp without a token -> 401 + WWW-Authenticate pointing at
//      /.well-known/oauth-protected-resource/mcp (RFC 9728).
//   2. Client reads /.well-known/oauth-authorization-server (RFC 8414), then
//      registers itself at /oauth/register (RFC 7591, dynamic registration).
//   3. Client opens /oauth/authorize in the browser. We show a tiny page asking
//      for the phone number + OTP (the family's master code while SMS is stubbed)
//      and run the SAME login as the app (worker/lib/login.ts).
//   4. We redirect back with an authorization code; the client swaps it at
//      /oauth/token (PKCE S256 required) for an access token = our usual JWT,
//      but with aud "mcp" so it can only read via /mcp, never write via /api.
//
// Short-lived state (codes, clients, refresh tokens) lives in OTP_KV.

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, Vars } from "../lib/env";
import { MCP_AUDIENCE, TOKEN_TTL_SECONDS, signToken } from "../lib/auth";
import { loginWithOtp } from "../lib/login";

export const MCP_PATH = "/mcp";
export const MCP_SCOPE = "chompy:read";

const CODE_TTL_SECONDS = 10 * 60;
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 90;

interface OAuthClient {
  client_id: string;
  client_secret?: string;
  client_name?: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "none" | "client_secret_post" | "client_secret_basic";
  created_at: number;
}

interface AuthCode {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  user_id: string;
  scope: string;
}

interface RefreshRecord {
  user_id: string;
  client_id: string;
  scope: string;
}

const kClient = (id: string) => `oauth:client:${id}`;
const kCode = (code: string) => `oauth:code:${code}`;
const kRefresh = (t: string) => `oauth:refresh:${t}`;

function origin(url: string): string {
  return new URL(url).origin;
}

function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Metadata documents ──────────────────────────────────────────────────────
export function protectedResourceMetadata(base: string) {
  return {
    resource: `${base}${MCP_PATH}`,
    authorization_servers: [base],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Chompy (read-only)",
    resource_documentation: `${base}/`,
  };
}

function authorizationServerMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    scopes_supported: [MCP_SCOPE],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"],
    service_documentation: `${base}/`,
  };
}

// The 401 challenge /mcp sends when there's no (valid) bearer token.
export function wwwAuthenticate(base: string, error?: string): string {
  const parts = [
    `Bearer realm="chompy"`,
    `resource_metadata="${base}/.well-known/oauth-protected-resource${MCP_PATH}"`,
  ];
  if (error) parts.push(`error="${error}"`);
  return parts.join(", ");
}

// ── Login page ──────────────────────────────────────────────────────────────
interface AuthorizeParams {
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  resource: string;
}

function readParams(src: (k: string) => string | undefined): AuthorizeParams {
  return {
    client_id: src("client_id") ?? "",
    redirect_uri: src("redirect_uri") ?? "",
    state: src("state") ?? "",
    code_challenge: src("code_challenge") ?? "",
    code_challenge_method: src("code_challenge_method") ?? "",
    scope: src("scope") ?? MCP_SCOPE,
    resource: src("resource") ?? "",
  };
}

function loginPage(p: AuthorizeParams, clientName: string, opts: { error?: string; phone?: string }) {
  const hidden = (Object.keys(p) as (keyof AuthorizeParams)[])
    .map((k) => `<input type="hidden" name="${k}" value="${escapeHtml(p[k])}">`)
    .join("\n      ");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect to Chompy</title>
<style>
  body{font-family:-apple-system,system-ui,sans-serif;background:#fff7ed;color:#1f2937;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}
  .card{background:#fff;border-radius:16px;padding:28px;max-width:380px;width:92%;box-shadow:0 8px 30px rgba(0,0,0,.08)}
  h1{font-size:1.35rem;margin:0 0 6px}p{margin:0 0 16px;color:#4b5563;font-size:.95rem}
  label{display:block;font-size:.85rem;font-weight:600;margin:12px 0 4px}
  input[type=text],input[type=tel]{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:1rem}
  button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:10px;background:#f97316;color:#fff;font-weight:700;font-size:1rem}
  .err{background:#fee2e2;color:#991b1b;padding:10px 12px;border-radius:10px;font-size:.9rem;margin-bottom:8px}
  .note{font-size:.8rem;color:#6b7280;margin-top:14px}
</style></head><body>
  <form class="card" method="post" action="/oauth/authorize">
    <h1>🍎 Connect to Chompy</h1>
    <p><strong>${escapeHtml(clientName)}</strong> wants <strong>read-only</strong> access to the meals, photos and nutrition data logged in Chompy.</p>
    ${opts.error ? `<div class="err">${escapeHtml(opts.error)}</div>` : ""}
    <label for="phone">Phone number</label>
    <input id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="10" placeholder="10-digit mobile" value="${escapeHtml(opts.phone ?? "")}" required>
    <label for="code">One-time code</label>
    <input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code" required>
    ${hidden}
    <button type="submit">Allow read-only access</button>
    <p class="note">Same phone number and code you use to sign in to the Chompy app. The connection can only read data; it can never add, edit or delete meals.</p>
  </form>
</body></html>`;
}

function errorPage(title: string, detail: string, status = 400) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body style="font-family:system-ui;padding:40px;max-width:520px;margin:auto"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

// Validate the static parts of an authorize request. Returns the client or an
// error page (never redirects on an untrusted redirect_uri).
async function validateAuthorize(
  env: Env,
  p: AuthorizeParams,
): Promise<{ ok: true; client: OAuthClient } | { ok: false; response: Response }> {
  if (!p.client_id) return { ok: false, response: errorPage("Missing client", "client_id is required.") };
  const raw = await env.OTP_KV.get(kClient(p.client_id));
  if (!raw) {
    return {
      ok: false,
      response: errorPage("Unknown client", "This client isn't registered. Re-add the connector and try again."),
    };
  }
  const client = JSON.parse(raw) as OAuthClient;
  if (!p.redirect_uri || !client.redirect_uris.includes(p.redirect_uri)) {
    return { ok: false, response: errorPage("Bad redirect", "redirect_uri doesn't match the registered client.") };
  }
  return { ok: true, client };
}

function redirectWithError(redirectUri: string, state: string, error: string, description: string) {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  u.searchParams.set("error_description", description);
  if (state) u.searchParams.set("state", state);
  return Response.redirect(u.toString(), 302);
}

// ── Routes ──────────────────────────────────────────────────────────────────
export const oauth = new Hono<{ Bindings: Env; Variables: Vars }>();

oauth.use("/.well-known/*", cors());
oauth.use("/oauth/register", cors());
oauth.use("/oauth/token", cors());

const wellKnownResource = (c: { req: { url: string }; json: (v: unknown) => Response }) =>
  c.json(protectedResourceMetadata(origin(c.req.url)));
oauth.get("/.well-known/oauth-protected-resource", (c) => wellKnownResource(c));
oauth.get(`/.well-known/oauth-protected-resource${MCP_PATH}`, (c) => wellKnownResource(c));
oauth.get("/.well-known/oauth-authorization-server", (c) =>
  c.json(authorizationServerMetadata(origin(c.req.url))),
);
// Some clients probe OIDC discovery first; serve the same document there.
oauth.get("/.well-known/openid-configuration", (c) =>
  c.json(authorizationServerMetadata(origin(c.req.url))),
);

// Dynamic client registration (RFC 7591). Open, like most MCP servers: the
// registration only records redirect URIs; access still needs a login.
oauth.post("/oauth/register", async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  const uris = Array.isArray(body?.redirect_uris)
    ? body!.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];
  if (uris.length === 0 || uris.length > 10) {
    return c.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris (1-10) is required." },
      400,
    );
  }
  for (const u of uris) {
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      return c.json({ error: "invalid_redirect_uri", error_description: `Bad URI: ${u}` }, 400);
    }
    const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocal)) {
      // Native-app custom schemes (e.g. cursor://, vscode://) are fine too.
      if (parsed.protocol === "http:") {
        return c.json({ error: "invalid_redirect_uri", error_description: `Insecure URI: ${u}` }, 400);
      }
    }
  }

  const requestedMethod = body?.token_endpoint_auth_method;
  const method: OAuthClient["token_endpoint_auth_method"] =
    requestedMethod === "client_secret_post" || requestedMethod === "client_secret_basic"
      ? requestedMethod
      : "none";

  const client: OAuthClient = {
    client_id: randomToken(16),
    client_secret: method === "none" ? undefined : randomToken(32),
    client_name: typeof body?.client_name === "string" ? body.client_name.slice(0, 100) : undefined,
    redirect_uris: uris,
    token_endpoint_auth_method: method,
    created_at: Math.floor(Date.now() / 1000),
  };
  await c.env.OTP_KV.put(kClient(client.client_id), JSON.stringify(client));

  return c.json(
    {
      client_id: client.client_id,
      ...(client.client_secret ? { client_secret: client.client_secret } : {}),
      client_id_issued_at: client.created_at,
      client_secret_expires_at: 0,
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      token_endpoint_auth_method: client.token_endpoint_auth_method,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: MCP_SCOPE,
    },
    201,
  );
});

// Authorization endpoint — GET renders the phone + OTP page.
oauth.get("/oauth/authorize", async (c) => {
  const p = readParams((k) => c.req.query(k));
  const v = await validateAuthorize(c.env, p);
  if (!v.ok) return v.response;

  const responseType = c.req.query("response_type");
  if (responseType !== "code") {
    return redirectWithError(p.redirect_uri, p.state, "unsupported_response_type", "Only response_type=code is supported.");
  }
  if (!p.code_challenge || p.code_challenge_method !== "S256") {
    return redirectWithError(p.redirect_uri, p.state, "invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }

  return c.html(loginPage(p, v.client.client_name ?? "An app", {}));
});

// Authorization endpoint — POST verifies the OTP and redirects with a code.
oauth.post("/oauth/authorize", async (c) => {
  const form = await c.req.parseBody();
  const str = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : undefined);
  const p = readParams(str);
  const v = await validateAuthorize(c.env, p);
  if (!v.ok) return v.response;
  if (!p.code_challenge || p.code_challenge_method !== "S256") {
    return redirectWithError(p.redirect_uri, p.state, "invalid_request", "PKCE S256 is required.");
  }

  const clientName = v.client.client_name ?? "An app";
  const phone = (str("phone") ?? "").replace(/\D/g, "");
  const code = (str("code") ?? "").trim();

  const login = await loginWithOtp(c.env, phone, code);
  if (!login.ok) {
    const status = login.code === "server_error" ? 500 : 400;
    return c.html(loginPage(p, clientName, { error: login.message, phone }), status);
  }

  const authCode = randomToken(32);
  const record: AuthCode = {
    client_id: p.client_id,
    redirect_uri: p.redirect_uri,
    code_challenge: p.code_challenge,
    user_id: login.userId,
    scope: MCP_SCOPE,
  };
  await c.env.OTP_KV.put(kCode(authCode), JSON.stringify(record), { expirationTtl: CODE_TTL_SECONDS });

  const u = new URL(p.redirect_uri);
  u.searchParams.set("code", authCode);
  if (p.state) u.searchParams.set("state", p.state);
  return Response.redirect(u.toString(), 302);
});

// Token endpoint — authorization_code (PKCE) and refresh_token grants.
oauth.post("/oauth/token", async (c) => {
  const ct = c.req.header("content-type") ?? "";
  let body: Record<string, string> = {};
  if (ct.includes("application/json")) {
    const j = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    for (const [k, v] of Object.entries(j)) if (typeof v === "string") body[k] = v;
  } else {
    const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    for (const [k, v] of Object.entries(form)) if (typeof v === "string") body[k] = v;
  }

  // Client identification: body params or HTTP Basic.
  let clientId = body.client_id ?? "";
  let clientSecret = body.client_secret ?? "";
  const authz = c.req.header("Authorization") ?? "";
  if (authz.startsWith("Basic ")) {
    try {
      const [id, secret = ""] = atob(authz.slice(6)).split(":");
      clientId = decodeURIComponent(id);
      clientSecret = decodeURIComponent(secret);
    } catch {
      /* fall through to invalid_client */
    }
  }

  const fail = (error: string, description: string, status: 400 | 401 = 400) =>
    c.json({ error, error_description: description }, status);

  const clientRaw = clientId ? await c.env.OTP_KV.get(kClient(clientId)) : null;
  if (!clientRaw) return fail("invalid_client", "Unknown client.", 401);
  const client = JSON.parse(clientRaw) as OAuthClient;
  if (client.token_endpoint_auth_method !== "none" && client.client_secret !== clientSecret) {
    return fail("invalid_client", "Client authentication failed.", 401);
  }

  const grant = body.grant_type;
  let userId: string;
  let scope: string;

  if (grant === "authorization_code") {
    const code = body.code ?? "";
    const raw = code ? await c.env.OTP_KV.get(kCode(code)) : null;
    if (!raw) return fail("invalid_grant", "Authorization code is invalid or expired.");
    // Single use — burn it before any further checks.
    await c.env.OTP_KV.delete(kCode(code));
    const rec = JSON.parse(raw) as AuthCode;
    if (rec.client_id !== clientId) return fail("invalid_grant", "Code was issued to another client.");
    if (body.redirect_uri && body.redirect_uri !== rec.redirect_uri) {
      return fail("invalid_grant", "redirect_uri mismatch.");
    }
    const verifier = body.code_verifier ?? "";
    if (!verifier || (await sha256Base64Url(verifier)) !== rec.code_challenge) {
      return fail("invalid_grant", "PKCE verification failed.");
    }
    userId = rec.user_id;
    scope = rec.scope;
  } else if (grant === "refresh_token") {
    const rt = body.refresh_token ?? "";
    const raw = rt ? await c.env.OTP_KV.get(kRefresh(rt)) : null;
    if (!raw) return fail("invalid_grant", "Refresh token is invalid or expired.");
    const rec = JSON.parse(raw) as RefreshRecord;
    if (rec.client_id !== clientId) return fail("invalid_grant", "Refresh token belongs to another client.");
    await c.env.OTP_KV.delete(kRefresh(rt)); // rotate
    userId = rec.user_id;
    scope = rec.scope;
  } else {
    return fail("unsupported_grant_type", "Use authorization_code or refresh_token.");
  }

  const accessToken = await signToken(c.env, userId, { audience: MCP_AUDIENCE });
  const refreshToken = randomToken(32);
  const refreshRecord: RefreshRecord = { user_id: userId, client_id: clientId, scope };
  await c.env.OTP_KV.put(kRefresh(refreshToken), JSON.stringify(refreshRecord), {
    expirationTtl: REFRESH_TTL_SECONDS,
  });

  c.header("Cache-Control", "no-store");
  return c.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope,
  });
});
