import { signJwt, verifyJwt, getUserFromRequest } from "../_lib/jwt.js";

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

// ── Password hashing con PBKDF2 + salt aleatorio ──────────────────────────────
// OWASP recomienda PBKDF2-HMAC-SHA256 con ≥600.000 iteraciones (2023).
// Cloudflare Workers no tiene bcrypt/Argon2, pero sí Web Crypto con PBKDF2.
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES        = 32; // 256 bits
const KEY_BYTES         = 32; // 256 bits

const enc = new TextEncoder();

/**
 * Deriva una clave PBKDF2 y la devuelve como hex.
 * Formato almacenado: "pbkdf2:<iterations>:<salt_hex>:<key_hex>"
 */
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));

  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password),
    { name: "PBKDF2" },
    false, ["deriveBits"]
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PBKDF2_ITERATIONS,
    },
    keyMaterial,
    KEY_BYTES * 8
  );

  const saltHex = toHex(salt);
  const keyHex  = toHex(new Uint8Array(derived));
  return `pbkdf2:${PBKDF2_ITERATIONS}:${saltHex}:${keyHex}`;
}

/**
 * Verifica una contraseña contra el hash almacenado.
 * Soporta el formato pbkdf2 nuevo Y el SHA-256 legacy (migración transparente).
 */
async function verifyPassword(password, stored) {
  // Formato legacy SHA-256 (antes de esta migración)
  if (!stored.startsWith("pbkdf2:")) {
    const legacyHash = toHex(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", enc.encode(password))
      )
    );
    return timingSafeEqual(legacyHash, stored);
  }

  // Formato pbkdf2:<iterations>:<salt_hex>:<key_hex>
  const parts = stored.split(":");
  if (parts.length !== 4) return false;
  const [, iterStr, saltHex, storedKeyHex] = parts;
  const iterations = parseInt(iterStr, 10);
  const salt = fromHex(saltHex);

  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password),
    { name: "PBKDF2" },
    false, ["deriveBits"]
  );

  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    KEY_BYTES * 8
  );

  return timingSafeEqual(toHex(new Uint8Array(derived)), storedKeyHex);
}

/** Comparación en tiempo constante para evitar timing attacks */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function toHex(buf) {
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return arr;
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function userPublic(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || "",
    created_at: row.created_at,
  };
}

// ── Router ───────────────────────────────────────────────────────────────────
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  try {
    if (request.method === "POST" && action === "register") return register(request, env);
    if (request.method === "POST" && action === "login")    return login(request, env);
    if (request.method === "GET"  && action === "me")       return me(request, env);
    if (request.method === "PUT"  && action === "profile")  return updateProfile(request, env);
    if (request.method === "GET"  && action === "orders")   return myOrders(request, env);
    if (request.method === "POST" && action === "address")  return saveAddress(request, env);
    if (request.method === "GET"  && action === "addresses") return getAddresses(request, env);
    if (request.method === "DELETE" && action === "address") return deleteAddress(request, env);
    if (request.method === "POST" && action === "sync-favs") return syncFavs(request, env);
    return Response.json({ error: "Acción no encontrada." }, { status: 404, headers: CORS });
  } catch (err) {
    return Response.json({ error: "Error interno." }, { status: 500, headers: CORS });
  }
}

// ── Register ─────────────────────────────────────────────────────────────────
async function register(request, env) {
  const body = await request.json().catch(() => ({}));
  const name  = String(body.name  || "").trim();
  const email = String(body.email || "").toLowerCase().trim();
  const phone = String(body.phone || "").trim();
  const pass  = String(body.password || "");

  if (!name)               return Response.json({ error: "Falta el nombre." }, { status: 400, headers: CORS });
  if (!validEmail(email))  return Response.json({ error: "Email inválido." }, { status: 400, headers: CORS });
  if (pass.length < 6)     return Response.json({ error: "La contraseña debe tener al menos 6 caracteres." }, { status: 400, headers: CORS });

  const existing = await env.canopia_db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing)            return Response.json({ error: "Ya existe una cuenta con ese email." }, { status: 409, headers: CORS });

  const hash = await hashPassword(pass);
  const result = await env.canopia_db
    .prepare("INSERT INTO users (name, email, phone, password_hash) VALUES (?, ?, ?, ?)")
    .bind(name, email, phone, hash).run();

  const user = await env.canopia_db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  const token = await signJwt({ uid: user.id, email }, env.JWT_SECRET);
  return Response.json({ ok: true, token, user: userPublic(user) }, { status: 201, headers: CORS });
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login(request, env) {
  const body  = await request.json().catch(() => ({}));
  const email = String(body.email || "").toLowerCase().trim();
  const pass  = String(body.password || "");

  if (!validEmail(email) || !pass)
    return Response.json({ error: "Email o contraseña inválidos." }, { status: 400, headers: CORS });

  const user = await env.canopia_db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  if (!user)
    return Response.json({ error: "Email o contraseña incorrectos." }, { status: 401, headers: CORS });

  const valid = await verifyPassword(pass, user.password_hash);
  if (!valid)
    return Response.json({ error: "Email o contraseña incorrectos." }, { status: 401, headers: CORS });

  const token = await signJwt({ uid: user.id, email }, env.JWT_SECRET);
  return Response.json({ ok: true, token, user: userPublic(user) }, { headers: CORS });
}

// ── Me (perfil actual) ────────────────────────────────────────────────────────
async function me(request, env) {
  const payload = await getUserFromRequest(request, env);
  if (!payload) return Response.json({ error: "No autenticado." }, { status: 401, headers: CORS });

  const user = await env.canopia_db.prepare("SELECT * FROM users WHERE id = ?").bind(payload.uid).first();
  if (!user)   return Response.json({ error: "Usuario no encontrado." }, { status: 404, headers: CORS });

  return Response.json({ ok: true, user: userPublic(user) }, { headers: CORS });
}

// ── Update profile ────────────────────────────────────────────────────────────
async function updateProfile(request, env) {
  const payload = await getUserFromRequest(request, env);
  if (!payload) return Response.json({ error: "No autenticado." }, { status: 401, headers: CORS });

  const body = await request.json().catch(() => ({}));
  const name  = String(body.name  || "").trim();
  const phone = String(body.phone || "").trim();

  if (!name) return Response.json({ error: "Falta el nombre." }, { status: 400, headers: CORS });

  await env.canopia_db
    .prepare("UPDATE users SET name = ?, phone = ? WHERE id = ?")
    .bind(name, phone, payload.uid).run();

  const user = await env.canopia_db.prepare("SELECT * FROM users WHERE id = ?").bind(payload.uid).first();
  return Response.json({ ok: true, user: userPublic(user) }, { headers: CORS });
}

// ── My orders ─────────────────────────────────────────────────────────────────
async function myOrders(request, env) {
  const payload = await getUserFromRequest(request, env);
  if (!payload) return Response.json({ error: "No autenticado." }, { status: 401, headers: CORS });

  const user = await env.canopia_db.prepare("SELECT phone FROM users WHERE id = ?").bind(payload.uid).first();
  if (!user) return Response.json({ ok: true, orders: [] }, { headers: CORS });

  // Match por teléfono (el checkout guarda customer_phone)
  const { results } = await env.canopia_db
    .prepare("SELECT * FROM orders WHERE customer_phone = ? OR user_id = ? ORDER BY created_at DESC LIMIT 50")
    .bind(user.phone || "", payload.uid).all();

  const orders = results.map((o) => ({
    id: o.id,
    total: o.total,
    status: o.status,
    items: JSON.parse(o.items_json || "[]"),
    note: o.customer_note,
    created_at: o.created_at,
  }));

  return Response.json({ ok: true, orders }, { headers: CORS });
}

// ── Addresses ─────────────────────────────────────────────────────────────────
async function saveAddress(request, env) {
  const payload = await getUserFromRequest(request, env);
  if (!payload) return Response.json({ error: "No autenticado." }, { status: 401, headers: CORS });

  const body  = await request.json().catch(() => ({}));
  const label = String(body.label || "Casa").trim();
  const line1 = String(body.line1 || "").trim();
  const city  = String(body.city  || "").trim();
  const notes = String(body.notes || "").trim();

  if (!line1) return Response.json({ error: "Falta la dirección." }, { status: 400, headers: CORS });

  if (body.id) {
    // Update
    await env.canopia_db
      .prepare("UPDATE user_addresses SET label=?, line1=?, city=?, notes=? WHERE id=? AND user_id=?")
      .bind(label, line1, city, notes, body.id, payload.uid).run();
  } else {
    // Insert
    await env.canopia_db
      .prepare("INSERT INTO user_addresses (user_id, label, line1, city, notes) VALUES (?,?,?,?,?)")
      .bind(payload.uid, label, line1, city, notes).run();
  }

  const { results } = await env.canopia_db
    .prepare("SELECT * FROM user_addresses WHERE user_id = ? ORDER BY id DESC")
    .bind(payload.uid).all();

  return Response.json({ ok: true, addresses: results }, { headers: CORS });
}

async function getAddresses(request, env) {
  const payload = await getUserFromRequest(request, env);
  if (!payload) return Response.json({ error: "No autenticado." }, { status: 401, headers: CORS });

  const { results } = await env.canopia_db
    .prepare("SELECT * FROM user_addresses WHERE user_id = ? ORDER BY id DESC")
    .bind(payload.uid).all();

  return Response.json({ ok: true, addresses: results }, { headers: CORS });
}

async function deleteAddress(request, env) {
  const payload = await getUserFromRequest(request, env);
  if (!payload) return Response.json({ error: "No autenticado." }, { status: 401, headers: CORS });

  const id = new URL(request.url).searchParams.get("id");
  await env.canopia_db
    .prepare("DELETE FROM user_addresses WHERE id = ? AND user_id = ?")
    .bind(id, payload.uid).run();

  return Response.json({ ok: true }, { headers: CORS });
}

// ── Sync favs ─────────────────────────────────────────────────────────────────
async function syncFavs(request, env) {
  const payload = await getUserFromRequest(request, env);
  if (!payload) return Response.json({ error: "No autenticado." }, { status: 401, headers: CORS });

  const body = await request.json().catch(() => ({}));
  const ids  = Array.isArray(body.favs) ? body.favs.map(String) : [];

  // Guardar como JSON en el campo favs del usuario
  await env.canopia_db
    .prepare("UPDATE users SET favs_json = ? WHERE id = ?")
    .bind(JSON.stringify(ids), payload.uid).run();

  return Response.json({ ok: true, favs: ids }, { headers: CORS });
}
