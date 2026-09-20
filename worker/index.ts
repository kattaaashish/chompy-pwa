// Chompy Worker — one entry point serves both the API (/api/*) and the built PWA
// (static assets, via the ASSETS binding). All state is on Cloudflare: D1, R2, KV.

import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, Vars } from "./lib/env";
import { auth } from "./routes/auth";
import { profile } from "./routes/profile";
import { mealRoutes } from "./routes/meals";
import { nutrition } from "./routes/nutrition";

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// The PWA is same-origin, but CORS keeps local `vite` dev (5173 -> 8787) working.
app.use("/api/*", cors());

const api = new Hono<{ Bindings: Env; Variables: Vars }>();
api.route("/", auth);
api.route("/", profile);
api.route("/", mealRoutes);
api.route("/", nutrition);
api.get("/health", (c) => c.json({ ok: true }));

app.route("/api", api);

// Anything not under /api and not a matched static asset: hand back to ASSETS,
// which returns index.html (SPA fallback) so the client app always boots.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
