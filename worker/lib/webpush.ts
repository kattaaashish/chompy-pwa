// Web Push sender for Cloudflare Workers — pure WebCrypto (no Node deps).
// Implements VAPID (RFC 8292) auth + aes128gcm payload encryption (RFC 8291 /
// RFC 8188). Used by the scheduled handler to push meal-logging reminders.

import type { Env } from "./env";

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// ── base64url helpers ────────────────────────────────────────────────────────
function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

// ── VAPID JWT (ES256) ────────────────────────────────────────────────────────
async function vapidJwt(env: Env, audience: string): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60, // 12h (must be < 24h)
    sub: env.VAPID_SUBJECT || "mailto:admin@chompy.app",
  };
  const enc = (o: unknown) =>
    bytesToB64url(new TextEncoder().encode(JSON.stringify(o)));
  const signingInput = `${enc(header)}.${enc(payload)}`;

  // Private key from the stored JWK components (d/x/y).
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: env.VAPID_PRIVATE_D,
      x: env.VAPID_PUBLIC_X,
      y: env.VAPID_PUBLIC_Y,
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${bytesToB64url(sig)}`;
}

// ── aes128gcm payload encryption (RFC 8291) ──────────────────────────────────
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

async function encryptPayload(
  payload: string,
  uaPublicB64: string,
  authSecretB64: string,
): Promise<{ body: Uint8Array }> {
  const uaPublic = b64urlToBytes(uaPublicB64); // 65-byte uncompressed point
  const authSecret = b64urlToBytes(authSecretB64); // 16 bytes
  const plaintext = new TextEncoder().encode(payload);

  // Ephemeral (application server) ECDH key pair for this message.
  const asKeys = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const asPublic = new Uint8Array(
    (await crypto.subtle.exportKey("raw", asKeys.publicKey)) as ArrayBuffer,
  ); // 65 bytes

  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  // workers-types mistypes the ECDH `public` field; cast the algorithm.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ecdhAlgo = { name: "ECDH", public: uaKey } as any;
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(ecdhAlgo, asKeys.privateKey, 256),
  );

  // IKM = HKDF(salt=auth, ikm=ecdh, info="WebPush: info\0"||ua||as, 32)
  const keyInfo = concat(
    new TextEncoder().encode("WebPush: info\0"),
    uaPublic,
    asPublic,
  );
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(
    salt,
    ikm,
    new TextEncoder().encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdf(
    salt,
    ikm,
    new TextEncoder().encode("Content-Encoding: nonce\0"),
    12,
  );

  // Single record: plaintext + 0x02 delimiter, AES-128-GCM (tag appended).
  const gcmKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, [
    "encrypt",
  ]);
  const record = concat(plaintext, new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, gcmKey, record),
  );

  // aes128gcm header: salt(16) || rs(4, uint32 BE) || idlen(1) || keyid(as_public,65)
  const rs = new Uint8Array([0, 0, 0x10, 0x00]); // 4096
  const header = concat(salt, rs, new Uint8Array([asPublic.length]), asPublic);
  return { body: concat(header, ciphertext) };
}

// Send one push. Returns the HTTP status (201 = accepted; 404/410 = expired,
// caller should delete the subscription).
export async function sendPush(
  env: Env,
  sub: PushSubscription,
  payload: string,
): Promise<number> {
  const audience = new URL(sub.endpoint).origin;
  const jwt = await vapidJwt(env, audience);
  const { body } = await encryptPayload(payload, sub.keys.p256dh, sub.keys.auth);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal",
    },
    body,
  });
  if (!res.ok) {
    console.error(`[push] ${res.status} to ${audience}: ${await res.text().catch(() => "")}`);
  }
  return res.status;
}
