import { signJwt, verifyJwt, getUserFromRequest } from "../_lib/jwt.js";
import { checkAdmin } from "../_lib/auth.js";

// ── CORS dinámico — acepta cualquier origen pero refleja el header correcto ──
const ALLOWED_ORIGINS = [
  "https://canopia-webeditor.pages.dev",
  "https://canopiagrow.pages.dev",
];

function getCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json",
  };
}

// ── Password hashing con PBKDF2 + salt aleatorio ──────────────────────────────
// OWASP recomienda PBKDF2-HMAC-SHA256 con ≥600.000 iteraciones (2023).
// Cloudflare Workers no tiene bcrypt/Argon2, pero sí Web Crypto con PBKDF2.
const PBKDF2_ITERATIONS = 10_000;
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
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: getCorsHeaders(request) });

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  try {
    if (request.method === "POST" && action === "register")       return register(request, env);
    if (request.method === "POST" && action === "login")          return login(request, env);
    if (request.method === "GET"  && action === "me")             return me(request, env);
    if (request.method === "PUT"  && action === "profile")        return updateProfile(request, env);
    if (request.method === "GET"  && action === "orders")         return myOrders(request, env);
    if (request.method === "POST" && action === "address")        return saveAddress(request, env);
    if (request.method === "GET"  && action === "addresses")      return getAddresses(request, env);
    if (request.method === "DELETE" && action === "address")      return deleteAddress(request, env);
    if (request.method === "POST" && action === "sync-favs")      return syncFavs(request, env);
    if (request.method === "POST" && action === "forgot")         return forgotPassword(request, env);
    if (request.method === "POST" && action === "reset-password") return resetPassword(request, env);
    if (request.method === "GET"  && action === "recovery-codes") return getRecoveryCodes(request, env);
    return Response.json({ error: "Acción no encontrada." }, { status: 404, headers: getCorsHeaders(request) });
  } catch (err) {
    return Response.json({ error: "Error interno." }, { status: 500, headers: getCorsHeaders(request) });
  }
}

// ── Register ─────────────────────────────────────────────────────────────────
async function register(request, env) {
  const body = await request.json().catch(() => ({}));
  const name  = String(body.name  || "").trim();
  const email = String(body.email || "").toLowerCase().trim();
  const phone = String(body.phone || "").trim();
  const pass  = String(body.password || "");

  if (!name)               return Response.json({ error: "Falta el nombre." }, { status: 400, headers: getCorsHeaders(request) });
  if (!validEmail(email))  return Response.json({ error: "Email inválido." }, { status: 400, headers: getCorsHeaders(request) });
  if (pass.length < 6)     return Response.json({ error: "La contraseña debe tener al menos 6 caracteres." }, { status: 400, headers: getCorsHeaders(request) });

  const existing = await env.canopia_db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing)            return Response.json({ error: "Ya existe una cuenta con ese email." }, { status: 409, headers: getCorsHeaders(request) });

  const hash = await hashPassword(pass);
  const result = await env.canopia_db
    .prepare("INSERT INTO users (name, email, phone, password_hash) VALUES (?, ?, ?, ?)")
    .bind(name, email, phone, hash).run();

  const user = await env.canopia_db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  const token = await signJwt({ uid: user.id, email }, env.JWT_SECRET);
  return Response.json({ ok: true, token, user: userPublic(user) }, { status: 201, headers: getCorsHeaders(request) });
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login(request, env) {
  const body  = await request.json().catch(() => ({}));
  const email = String(body.email || "").toLowerCase().trim();
  const pass  = String(body.password || "");

  if (!validEmail(email) || !pass)
    return Response.json({ error: "Email o contraseña inválidos." }, { status: 400, headers: getCorsHeaders(request) });

  const user = await env.canopia_db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  if (!user)
    return Response.json({ error: "Email o contraseña incorrectos." }, { status: 401, headers: getCorsHeaders(request) });

  const valid = await verifyPassword(pass, user.password_hash);
  if (!valid)
    return Response.json({ error: "Email o contraseña incorrectos." }, { status: 401, headers: getCorsHeaders(request) });

  const token = await signJwt({ uid: user.id, email }, env.JWT_SECRET);
  return Response.json({ ok: true, token, user: userPublic(user) }, { headers: getCorsHeaders(request) });
}

// ── Me (perfil actual) ────────────────────────────────────────────────────────
async function me(request, env) {
  const payload = await getUserFromRequest(request, env);
  if (!payload) return Response.json({ error: "No autenticado." }, { status: 401, headers: getCorsHeaders(request) });

  const user = await env.canopia_db.prepare("SELECT * FROM users WHERE id = ?").bind(payload.uid).first();
  if (!user)   return Response.json({ error: "Usuario no encontrado." }, { status: 404, headers: getCorsHeaders(request) });

  return Response.json({ ok: true, user: userPublic(user) }, { headers: getCorsHeaders(request) });
}

// ── Update profile ────────────────────────────────────────────────────────────
async function updateProfile(request, env) {
  const payload = await getUserFromRequest(request, env);
  if (!payload) return Response.json({ error: "No autenticado." }, { status: 401, headers: getCorsHeaders(request) });

  const body = await request.json().catch(() => ({}));
  const name  = String(body.name  || "").trim();
  const phone = String(body.phone || "").trim();

  if (!name) return Response.json({ error: "Falta el nombre." }, { status: 400, headers: getCorsHeaders(request) });

  await env.canopia_db
    .prepare("UPDATE users SET name = ?, phone = ? WHERE id = ?")
    .bind(name, phone, payload.uid).run();

  const user = await env.canopia_db.prepare("SELECT * FROM users WHERE id = ?").bind(payload.uid).first();
  return Response.json({ ok: true, user: userPublic(user) }, { headers: getCorsHeaders(request) });
}

// ── My orders ─────────────────────────────────────────────────────────────────
async function myOrders(request, env) {
  const payload = await getUserFromRequest(request, env);
  if (!payload) return Response.json({ error: "No autenticado." }, { status: 401, headers: getCorsHeaders(request) });

  const user = await env.canopia_db.prepare("SELECT phone FROM users WHERE id = ?").bind(payload.uid).first();
  if (!user) return Response.json({ ok: true, orders: [] }, { headers: getCorsHeaders(request) });

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

  return Response.json({ ok: true, orders }, { headers: getCorsHeaders(request) });
}

// ── Addresses ─────────────────────────────────────────────────────────────────
async function saveAddress(request, env) {
  const payload = await getUserFromRequest(request, env);
  if (!payload) return Response.json({ error: "No autenticado." }, { status: 401, headers: getCorsHeaders(request) });

  const body  = await request.json().catch(() => ({}));
  const label = String(body.label || "Casa").trim();
  const line1 = String(body.line1 || "").trim();
  const city  = String(body.city  || "").trim();
  const notes = String(body.notes || "").trim();

  if (!line1) return Response.json({ error: "Falta la dirección." }, { status: 400, headers: getCorsHeaders(request) });

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

  return Response.json({ ok: true, addresses: results }, { headers: getCorsHeaders(request) });
}

async function getAddresses(request, env) {
  const payload = await getUserFromRequest(request, env);
  if (!payload) return Response.json({ error: "No autenticado." }, { status: 401, headers: getCorsHeaders(request) });

  const { results } = await env.canopia_db
    .prepare("SELECT * FROM user_addresses WHERE user_id = ? ORDER BY id DESC")
    .bind(payload.uid).all();

  return Response.json({ ok: true, addresses: results }, { headers: getCorsHeaders(request) });
}

async function deleteAddress(request, env) {
  const payload = await getUserFromRequest(request, env);
  if (!payload) return Response.json({ error: "No autenticado." }, { status: 401, headers: getCorsHeaders(request) });

  const id = new URL(request.url).searchParams.get("id");
  await env.canopia_db
    .prepare("DELETE FROM user_addresses WHERE id = ? AND user_id = ?")
    .bind(id, payload.uid).run();

  return Response.json({ ok: true }, { headers: getCorsHeaders(request) });
}

// ── Sync favs ─────────────────────────────────────────────────────────────────
async function syncFavs(request, env) {
  const payload = await getUserFromRequest(request, env);
  if (!payload) return Response.json({ error: "No autenticado." }, { status: 401, headers: getCorsHeaders(request) });

  const body = await request.json().catch(() => ({}));
  const ids  = Array.isArray(body.favs) ? body.favs.map(String) : [];

  // Guardar como JSON en el campo favs del usuario
  await env.canopia_db
    .prepare("UPDATE users SET favs_json = ? WHERE id = ?")
    .bind(JSON.stringify(ids), payload.uid).run();

  return Response.json({ ok: true, favs: ids }, { headers: getCorsHeaders(request) });
}

// ── Recuperación de contraseña ────────────────────────────────────────────────
// Genera un código de 6 dígitos y lo guarda en la DB con expiración de 15 min.
// El código se muestra en pantalla para que el admin lo comparta por WhatsApp.

async function forgotPassword(request, env) {
  const body  = await request.json().catch(() => ({}));
  const email = String(body.email || "").toLowerCase().trim();

  if (!validEmail(email))
    return Response.json({ error: "Email inválido." }, { status: 400, headers: getCorsHeaders(request) });

  const user = await env.canopia_db
    .prepare("SELECT id, name, phone FROM users WHERE email = ?").bind(email).first();

  // Siempre responder igual para no revelar si el email existe
  if (!user)
    return Response.json({ ok: true, hint: "Si el email existe, el código fue generado." }, { headers: getCorsHeaders(request) });

  // Código de 6 dígitos
  const code    = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

  // Guardar en la tabla reset_codes (la creamos si no existe)
  await env.canopia_db.prepare(`
    CREATE TABLE IF NOT EXISTS reset_codes (
      user_id  INTEGER PRIMARY KEY,
      code     TEXT NOT NULL,
      expires  TEXT NOT NULL
    )
  `).run();

  await env.canopia_db
    .prepare("INSERT OR REPLACE INTO reset_codes (user_id, code, expires) VALUES (?, ?, ?)")
    .bind(user.id, code, expires).run();

  // Devolver el código para que puedas mandarlo por WhatsApp
  return Response.json({
    ok: true,
    code,                        // visible solo para el admin/propietario
    name: user.name,
    phone: user.phone || "",
    expires_in: "15 minutos",
    message: `Tu código de recuperación de Canopia es: ${code} (válido 15 min)`,
  }, { headers: getCorsHeaders(request) });
}

async function resetPassword(request, env) {
  const body     = await request.json().catch(() => ({}));
  const email    = String(body.email    || "").toLowerCase().trim();
  const code     = String(body.code     || "").trim();
  const password = String(body.password || "");

  if (!validEmail(email) || !code || password.length < 6)
    return Response.json({ error: "Datos incompletos." }, { status: 400, headers: getCorsHeaders(request) });

  const user = await env.canopia_db
    .prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (!user)
    return Response.json({ error: "Email incorrecto." }, { status: 400, headers: getCorsHeaders(request) });

  const row = await env.canopia_db
    .prepare("SELECT code, expires FROM reset_codes WHERE user_id = ?").bind(user.id).first();

  if (!row)
    return Response.json({ error: "No hay código de recuperación para este usuario." }, { status: 400, headers: getCorsHeaders(request) });

  if (new Date(row.expires) < new Date())
    return Response.json({ error: "El código expiró. Solicitá uno nuevo." }, { status: 400, headers: getCorsHeaders(request) });

  if (!timingSafeEqual(row.code, code))
    return Response.json({ error: "Código incorrecto." }, { status: 400, headers: getCorsHeaders(request) });

  // Actualizar contraseña y borrar el código
  const newHash = await hashPassword(password);
  await env.canopia_db.batch([
    env.canopia_db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(newHash, user.id),
    env.canopia_db.prepare("DELETE FROM reset_codes WHERE user_id = ?").bind(user.id),
  ]);

  const token = await signJwt({ uid: user.id, email }, env.JWT_SECRET);
  const updatedUser = await env.canopia_db.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();

  return Response.json({ ok: true, token, user: userPublic(updatedUser) }, { headers: getCorsHeaders(request) });
}

// ── Ver códigos pendientes (solo admin) ───────────────────────────────────────
async function getRecoveryCodes(request, env) {
  // Acepta tanto "Authorization: Bearer TOKEN" como "x-admin-password: TOKEN"
  const bearerHeader = request.headers.get("Authorization") || "";
  const xHeader      = request.headers.get("x-admin-password") || "";
  const token = bearerHeader.startsWith("Bearer ") ? bearerHeader.slice(7) : xHeader;

  if (!env.ADMIN_TOKEN) return Response.json({ error: "Admin no configurado." }, { status: 401, headers: getCorsHeaders(request) });
  if (!token || token !== env.ADMIN_TOKEN) return Response.json({ error: "Clave incorrecta." }, { status: 401, headers: getCorsHeaders(request) });

  // Asegurar que la tabla existe
  await env.canopia_db.prepare(`
    CREATE TABLE IF NOT EXISTS reset_codes (
      user_id  INTEGER PRIMARY KEY,
      code     TEXT NOT NULL,
      expires  TEXT NOT NULL
    )
  `).run();

  const { results } = await env.canopia_db.prepare(`
    SELECT r.code, r.expires, u.name, u.email, u.phone
    FROM reset_codes r
    JOIN users u ON u.id = r.user_id
    WHERE r.expires > datetime('now')
    ORDER BY r.expires ASC
  `).all();

  return Response.json({ codes: results }, { headers: getCorsHeaders(request) });
}
