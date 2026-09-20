// Client-side Web Push enablement for meal reminders.
import { api } from "./api";

export type ReminderState = "unsupported" | "denied" | "on" | "off";

export function pushSupported(): boolean {
  return (
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function reminderState(): Promise<ReminderState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? "on" : "off";
}

export async function enableReminders(token: string): Promise<void> {
  if (!pushSupported()) throw new Error("Reminders aren't supported on this device.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Please allow notifications to get reminders.");

  const { key } = await api.pushKey();
  if (!key) throw new Error("Reminders aren't configured on the server yet.");

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    });
  }
  await api.pushSubscribe(token, sub.toJSON());
}

export async function disableReminders(token: string): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await api.pushUnsubscribe(token, sub.endpoint);
    await sub.unsubscribe();
  }
}
