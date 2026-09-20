// Web Push subscription management. The client subscribes via the browser Push
// API and sends the subscription here; the scheduled handler (worker/index.ts)
// later pushes meal reminders to every stored subscription.

import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import type { Env, Vars } from "../lib/env";
import { apiError } from "../lib/http";
import { requireAuth } from "../lib/auth";
import { db } from "../db/client";
import { pushSubscriptions } from "../db/schema";

export const push = new Hono<{ Bindings: Env; Variables: Vars }>();

// The VAPID public key the client needs to subscribe. Public by design.
push.get("/push/key", (c) => c.json({ key: c.env.VAPID_PUBLIC ?? "" }));

push.post("/push/subscribe", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  const sub = body?.subscription ?? body;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (typeof endpoint !== "string" || !p256dh || !auth) {
    return apiError(c, "validation_failed", "Invalid subscription.", 422);
  }

  try {
    await db(c.env)
      .insert(pushSubscriptions)
      .values({ id: crypto.randomUUID(), profileId: userId, endpoint, p256dh, auth })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { profileId: userId, p256dh, auth },
      })
      .run();
  } catch (e) {
    console.error(`[push:subscribe] ${e}`);
    return apiError(c, "server_error", "Couldn't save the subscription.", 500, { retryable: true });
  }
  return c.json({ status: "subscribed" });
});

push.post("/push/unsubscribe", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  const endpoint = body?.endpoint;
  if (typeof endpoint !== "string") {
    return apiError(c, "validation_failed", "Missing endpoint.", 422);
  }
  await db(c.env)
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.profileId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .run();
  return c.json({ status: "unsubscribed" });
});
