// Chompy Worker — one entry point serves both the API (/api/*) and the built PWA
// (static assets, via the ASSETS binding). All state is on Cloudflare: D1, R2, KV.
// A scheduled (cron) handler sends meal-logging reminders via Web Push.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { eq } from "drizzle-orm";
import type { Env, Vars } from "./lib/env";
import { auth } from "./routes/auth";
import { profile } from "./routes/profile";
import { mealRoutes } from "./routes/meals";
import { nutrition } from "./routes/nutrition";
import { push } from "./routes/push";
import { recommendation } from "./routes/recommendation";
import { db } from "./db/client";
import { pushSubscriptions } from "./db/schema";
import { sendPush } from "./lib/webpush";
import { runDailyRecommendations } from "./lib/recommend";

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// The PWA is same-origin, but CORS keeps local `vite` dev (5173 -> 8787) working.
app.use("/api/*", cors());

const api = new Hono<{ Bindings: Env; Variables: Vars }>();
api.route("/", auth);
api.route("/", profile);
api.route("/", mealRoutes);
api.route("/", nutrition);
api.route("/", push);
api.route("/", recommendation);
api.get("/health", (c) => c.json({ ok: true }));

app.route("/api", api);

// Anything not under /api and not a matched static asset: hand back to ASSETS,
// which returns index.html (SPA fallback) so the client app always boots.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

// ── Scheduled reminders (Cloudflare Cron Triggers) ───────────────────────────
// Crons are in UTC; IST = UTC+5:30:
//   "30 4  * * *" = 10:00 IST  -> breakfast
//   "30 11 * * *" = 17:00 IST  -> lunch + snacks
//   "30 15 * * *" = 21:00 IST  -> dinner
function reminderForCron(cron: string): { title: string; body: string } | null {
  switch (cron) {
    case "30 4 * * *":
      return { title: "Good morning! 🌅", body: "Time to log your breakfast in Chompy." };
    case "30 11 * * *":
      return { title: "Lunch & snacks 🥗", body: "Did you eat? Log your lunch and snacks." };
    case "30 15 * * *":
      return { title: "Dinner time 🍽️", body: "Log your dinner before bed!" };
    default:
      return null;
  }
}

async function sendReminders(env: Env, reminder: { title: string; body: string }) {
  const database = db(env);
  const subs = await database.select().from(pushSubscriptions).all();
  const payload = JSON.stringify({ ...reminder, url: "/" });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        const status = await sendPush(
          env,
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        // 404/410 => the subscription is gone; clean it up.
        if (status === 404 || status === 410) {
          await database.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id)).run();
        }
      } catch (e) {
        console.error(`[push] send failed: ${e}`);
      }
    }),
  );
}

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // 19:00 IST: dinner recommendations (gap analysis + LLM). Others: reminders.
    if (controller.cron === "30 13 * * *") {
      ctx.waitUntil(runDailyRecommendations(env));
      return;
    }
    const reminder = reminderForCron(controller.cron);
    if (reminder) ctx.waitUntil(sendReminders(env, reminder));
  },
} satisfies ExportedHandler<Env>;
