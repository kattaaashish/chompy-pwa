// /mcp — Streamable HTTP endpoint (stateless, JSON responses). Bearer token =
// our JWT, minted either by the OAuth flow in ./oauth.ts (aud "mcp") or by the
// app's own login (/api/auth/verify-otp) — both are accepted here.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Env, Vars } from "../lib/env";
import { bearer, verifyTokenClaims } from "../lib/auth";
import { MCP_PATH, MCP_SCOPE, oauth, wwwAuthenticate } from "./oauth";
import { buildServer } from "./server";

export const mcp = new Hono<{ Bindings: Env; Variables: Vars }>();

mcp.route("/", oauth);

mcp.use(
  MCP_PATH,
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "Accept", "Mcp-Session-Id", "MCP-Protocol-Version", "Last-Event-ID"],
    exposeHeaders: ["Mcp-Session-Id", "WWW-Authenticate"],
  }),
);

mcp.all(MCP_PATH, async (c) => {
  const base = new URL(c.req.url).origin;

  const token = bearer(c);
  const claims = token ? await verifyTokenClaims(c.env, token) : null;
  if (!token || !claims) {
    return c.json(
      { error: token ? "invalid_token" : "unauthorized", error_description: "Sign in to Chompy to use this connector." },
      401,
      { "WWW-Authenticate": wwwAuthenticate(base, token ? "invalid_token" : undefined) },
    );
  }

  // Stateless: no server-push stream (GET) and no session to delete (DELETE).
  if (c.req.method !== "POST") {
    return c.json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }, 405, { Allow: "POST" });
  }

  const server = buildServer(c.env, claims.userId, base);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(c.req.raw, {
      authInfo: { token, clientId: "chompy-mcp", scopes: [MCP_SCOPE], extra: { userId: claims.userId } },
    });
  } finally {
    c.executionCtx.waitUntil(server.close().catch(() => {}));
  }
});
