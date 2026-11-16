/**
 * JWT mínimo usando Web Crypto API nativa de Cloudflare Workers.
 * HS256, sin dependencias externas.
 */

const enc = new TextEncoder();

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function getKey(secret) {
  return crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign", "verify"]
  );
}

export async function signJwt(payload, secret, expiresInSeconds = 60 * 60 * 24 * 30) {
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body   = b64url(enc.encode(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  })));
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(sig)}`;
}

export async function verifyJwt(token, secret) {
  if (!secret || typeof token !== "string" || token.length > 4096) return null;
  const [header, body, sig, extra] = token.split(".");
  if (extra !== undefined || ![header, body, sig].every((part) => /^[A-Za-z0-9_-]+$/.test(part || ""))) return null;
  try {
    const decode = (value) => JSON.parse(new TextDecoder().decode(b64urlDecode(value)));
    if (decode(header).alg !== "HS256") return null;
    const key = await getKey(secret);
    const valid = await crypto.subtle.verify("HMAC", key, b64urlDecode(sig), enc.encode(`${header}.${body}`));
    if (!valid) return null;
    const payload = decode(body);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(payload.exp) || payload.exp <= now) return null;
    if (payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || payload.nbf > now)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getUserFromRequest(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || !env.JWT_SECRET) return null;
  return verifyJwt(token, env.JWT_SECRET);
}
