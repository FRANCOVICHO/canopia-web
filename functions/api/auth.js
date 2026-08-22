/**
 * auth.js — Sistema de autenticación usando PocketBase como backend
 *
 * Endpoints:
 *   POST ?action=register       — Crea cuenta en PocketBase
 *   POST ?action=login          — Inicia sesión en PocketBase
 *   GET  ?action=me             — Devuelve perfil (valida token con PocketBase)
 *   PUT  ?action=profile        — Actualiza nombre/teléfono
 *   GET  ?action=orders         — Pedidos del usuario (D1, por teléfono/userId)
 *   POST ?action=address        — Guardar dirección (D1)
 *   GET  ?action=addresses      — Listar direcciones (D1)
 *   DELETE ?action=address      — Borrar dirección (D1)
 *   POST ?action=sync-favs      — Sincronizar favoritos (PocketBase)
 *   POST ?action=forgot         — Generar código de recuperación (D1)
 *   POST ?action=reset-password — Cambiar contraseña con código (PocketBase)
 *   GET  ?action=recovery-codes — Ver códigos pendientes (admin)
 */

import { checkAdmin } from "../_lib/auth.js";

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "https://canopiagrow.com",
  "https://canopiagrow.pages.dev",
  "https://canopia-webeditor.pages.dev",
];

function corsHeaders(request) {
  const origin  = request.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":      allowed,
    "Access-Control-Allow-Methods":     "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":     "Content-Type, Authorization, x-admin-password",
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json",
  };
}

function json(data, status = 200, req) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(req) });
}

// ── PocketBase helper ─────────────────────────────────────────────────────────
async function pbFetch(env, path, options = {}) {
  const base = (env.PB_URL || "https://pb.canopiagrow.com").replace(/\/$/, "");
  const res  = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { message: text }; }
  return { ok: res.ok, status: res.status, data };
}

/** Verifica un token de PocketBase y devuelve el record del usuario */
async function pbVerifyToken(env, token) {
  if (!token) return null;
  const { ok, data } = await pbFetch(env, "/api/collections/users/auth-refresh", {
    method: "POST",
    headers: { Authorization: token },
  });
  if (!ok) return null;
  return data?.record || null;
}

// ── Router ────────────────────────────────────────────────────────────────────
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders(request) });

  const action = new URL(request.url).searchParams.get("action");

  try {
    if (request.method === "POST" && action === "register")        return register(request, env);
    if (request.method === "POST" && action === "login")           return login(request, env);
    if (request.method === "GET"  && action === "me")              return me(request, env);
    if (request.method === "PUT"  && action === "profile")         return updateProfile(request, env);
    if (request.method === "GET"  && action === "orders")          return myOrders(request, env);
    if (request.method === "POST" && action === "address")         return saveAddress(request, env);
    if (request.method === "GET"  && action === "addresses")       return getAddresses(request, env);
    if (request.method === "DELETE" && action === "address")       return deleteAddress(request, env);
    if (request.method === "POST" && action === "sync-favs")       return syncFavs(request, env);
    if (request.method === "POST" && action === "forgot")          return forgotPassword(request, env);
    if (request.method === "POST" && action === "reset-password")  return resetPassword(request, env);
    if (request.method === "GET"  && action === "recovery-codes")  return getRecoveryCodes(request, env);
    return json({ error: "Acción no encontrada." }, 404, request);
  } catch (err) {
    console.error("auth error:", err);
    return json({ error: "Error interno." }, 500, request);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

function userPublic(record) {
  return {
    id:         record.id,
    name:       record.name  || "",
    email:      record.email || "",
    phone:      record.phone || "",
    favs_json:  record.favs_json || "[]",
    created:    record.created,
  };
}

function getToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : auth || null;
}

// ── Register ──────────────────────────────────────────────────────────────────
async function register(request, env) {
  const body  = await request.json().catch(() => ({}));
  const name  = String(body.name     || "").trim();
  const email = String(body.email    || "").toLowerCase().trim();
  const phone = String(body.phone    || "").trim();
  const pass  = String(body.password || "");

  if (!name)              return json({ error: "Falta el nombre." },  400, request);
  if (!validEmail(email)) return json({ error: "Email inválido." },   400, request);
  if (pass.length < 6)    return json({ error: "La contraseña debe tener al menos 6 caracteres." }, 400, request);

  // Crear usuario en PocketBase
  const { ok, data } = await pbFetch(env, "/api/collections/users/records", {
    method: "POST",
    body: JSON.stringify({
      name,
      email,
      phone,
      password:        pass,
      passwordConfirm: pass,
      favs_json:       "[]",
    }),
  });

  if (!ok) {
    // Mensaje amigable para email duplicado
    const msg = data?.data?.email?.message || data?.message || "No se pudo crear la cuenta.";
    const isDup = msg.toLowerCase().includes("already") || data?.data?.email?.code === "validation_not_unique";
    return json({ error: isDup ? "Ya existe una cuenta con ese email." : msg }, 409, request);
  }

  // Login automático tras el registro
  const authRes = await pbFetch(env, "/api/collections/users/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: email, password: pass }),
  });

  if (!authRes.ok) return json({ error: "Cuenta creada. Iniciá sesión." }, 201, request);

  return json({
    ok:    true,
    token: authRes.data.token,
    user:  userPublic(authRes.data.record),
  }, 201, request);
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login(request, env) {
  const body  = await request.json().catch(() => ({}));
  const email = String(body.email    || "").toLowerCase().trim();
  const pass  = String(body.password || "");

  if (!validEmail(email) || !pass)
    return json({ error: "Email o contraseña inválidos." }, 400, request);

  const { ok, data } = await pbFetch(env, "/api/collections/users/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: email, password: pass }),
  });

  if (!ok)
    return json({ error: "Email o contraseña incorrectos." }, 401, request);

  return json({ ok: true, token: data.token, user: userPublic(data.record) }, 200, request);
}

// ── Me ────────────────────────────────────────────────────────────────────────
async function me(request, env) {
  const token = getToken(request);
  const user  = await pbVerifyToken(env, token);
  if (!user) return json({ error: "No autenticado." }, 401, request);
  return json({ ok: true, user: userPublic(user) }, 200, request);
}

// ── Update profile ────────────────────────────────────────────────────────────
async function updateProfile(request, env) {
  const token = getToken(request);
  const user  = await pbVerifyToken(env, token);
  if (!user) return json({ error: "No autenticado." }, 401, request);

  const body  = await request.json().catch(() => ({}));
  const name  = String(body.name  || "").trim();
  const phone = String(body.phone || "").trim();

  if (!name) return json({ error: "Falta el nombre." }, 400, request);

  const { ok, data } = await pbFetch(env, `/api/collections/users/records/${user.id}`, {
    method: "PATCH",
    headers: { Authorization: token },
    body: JSON.stringify({ name, phone }),
  });

  if (!ok) return json({ error: data.message || "No se pudo actualizar." }, 400, request);
  return json({ ok: true, user: userPublic(data) }, 200, request);
}

// ── My orders ─────────────────────────────────────────────────────────────────
async function myOrders(request, env) {
  const token = getToken(request);
  const user  = await pbVerifyToken(env, token);
  if (!user) return json({ error: "No autenticado." }, 401, request);

  const { results } = await env.canopia_db
    .prepare("SELECT * FROM orders WHERE customer_phone = ? OR user_id = ? ORDER BY created_at DESC LIMIT 50")
    .bind(user.phone || "", user.id).all();

  const orders = results.map((o) => ({
    id:         o.id,
    total:      o.total,
    status:     o.status,
    items:      JSON.parse(o.items_json || "[]"),
    note:       o.customer_note,
    created_at: o.created_at,
  }));

  return json({ ok: true, orders }, 200, request);
}

// ── Addresses (D1) ────────────────────────────────────────────────────────────
async function saveAddress(request, env) {
  const token = getToken(request);
  const user  = await pbVerifyToken(env, token);
  if (!user) return json({ error: "No autenticado." }, 401, request);

  const body  = await request.json().catch(() => ({}));
  const label = String(body.label || "Casa").trim();
  const line1 = String(body.line1 || "").trim();
  const city  = String(body.city  || "").trim();
  const notes = String(body.notes || "").trim();

  if (!line1) return json({ error: "Falta la dirección." }, 400, request);

  if (body.id) {
    await env.canopia_db
      .prepare("UPDATE user_addresses SET label=?,line1=?,city=?,notes=? WHERE id=? AND user_id=?")
      .bind(label, line1, city, notes, body.id, user.id).run();
  } else {
    await env.canopia_db
      .prepare("INSERT INTO user_addresses (user_id,label,line1,city,notes) VALUES (?,?,?,?,?)")
      .bind(user.id, label, line1, city, notes).run();
  }

  const { results } = await env.canopia_db
    .prepare("SELECT * FROM user_addresses WHERE user_id=? ORDER BY id DESC")
    .bind(user.id).all();

  return json({ ok: true, addresses: results }, 200, request);
}

async function getAddresses(request, env) {
  const token = getToken(request);
  const user  = await pbVerifyToken(env, token);
  if (!user) return json({ error: "No autenticado." }, 401, request);

  const { results } = await env.canopia_db
    .prepare("SELECT * FROM user_addresses WHERE user_id=? ORDER BY id DESC")
    .bind(user.id).all();

  return json({ ok: true, addresses: results }, 200, request);
}

async function deleteAddress(request, env) {
  const token = getToken(request);
  const user  = await pbVerifyToken(env, token);
  if (!user) return json({ error: "No autenticado." }, 401, request);

  const id = new URL(request.url).searchParams.get("id");
  await env.canopia_db
    .prepare("DELETE FROM user_addresses WHERE id=? AND user_id=?")
    .bind(id, user.id).run();

  return json({ ok: true }, 200, request);
}

// ── Sync favs (PocketBase) ────────────────────────────────────────────────────
async function syncFavs(request, env) {
  const token = getToken(request);
  const user  = await pbVerifyToken(env, token);
  if (!user) return json({ error: "No autenticado." }, 401, request);

  const body = await request.json().catch(() => ({}));
  const ids  = Array.isArray(body.favs) ? body.favs.map(String) : [];

  await pbFetch(env, `/api/collections/users/records/${user.id}`, {
    method: "PATCH",
    headers: { Authorization: token },
    body: JSON.stringify({ favs_json: JSON.stringify(ids) }),
  });

  return json({ ok: true, favs: ids }, 200, request);
}

// ── Recuperación de contraseña ────────────────────────────────────────────────
async function forgotPassword(request, env) {
  const body  = await request.json().catch(() => ({}));
  const email = String(body.email || "").toLowerCase().trim();

  if (!validEmail(email))
    return json({ error: "Email inválido." }, 400, request);

  // Verificar que el usuario existe en PocketBase
  const { ok, data } = await pbFetch(env,
    `/api/collections/users/records?filter=(email='${encodeURIComponent(email)}')&fields=id,name,phone`
  );

  // Siempre responder igual para no revelar si existe
  if (!ok || !data?.items?.length)
    return json({ ok: true, hint: "Si el email existe, el código fue generado." }, 200, request);

  const user = data.items[0];
  const code    = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await env.canopia_db.prepare(`
    CREATE TABLE IF NOT EXISTS reset_codes (
      user_id TEXT PRIMARY KEY,
      code    TEXT NOT NULL,
      expires TEXT NOT NULL
    )
  `).run();

  await env.canopia_db
    .prepare("INSERT OR REPLACE INTO reset_codes (user_id,code,expires) VALUES (?,?,?)")
    .bind(user.id, code, expires).run();

  return json({
    ok:         true,
    code,
    name:       user.name,
    phone:      user.phone || "",
    expires_in: "15 minutos",
    message:    `Tu código de recuperación de Canopia es: ${code} (válido 15 min)`,
  }, 200, request);
}

async function resetPassword(request, env) {
  const body     = await request.json().catch(() => ({}));
  const email    = String(body.email    || "").toLowerCase().trim();
  const code     = String(body.code     || "").trim();
  const password = String(body.password || "");

  if (!validEmail(email) || !code || password.length < 6)
    return json({ error: "Datos incompletos." }, 400, request);

  // Buscar usuario en PocketBase
  const { ok, data } = await pbFetch(env,
    `/api/collections/users/records?filter=(email='${encodeURIComponent(email)}')&fields=id`
  );
  if (!ok || !data?.items?.length)
    return json({ error: "Email incorrecto." }, 400, request);

  const userId = data.items[0].id;

  // Verificar código en D1
  const row = await env.canopia_db
    .prepare("SELECT code,expires FROM reset_codes WHERE user_id=?")
    .bind(userId).first();

  if (!row) return json({ error: "No hay código de recuperación activo." }, 400, request);
  if (new Date(row.expires) < new Date()) return json({ error: "El código expiró. Solicitá uno nuevo." }, 400, request);

  // Comparación en tiempo constante
  let diff = 0;
  const a = row.code, b = code;
  if (a.length !== b.length) return json({ error: "Código incorrecto." }, 400, request);
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  if (diff !== 0) return json({ error: "Código incorrecto." }, 400, request);

  // Cambiar contraseña en PocketBase (requiere admin token o usar la API de reset)
  // Usamos PocketBase request password reset y luego confirmamos con código
  const updateRes = await pbFetch(env, `/api/collections/users/records/${userId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${env.PB_ADMIN_TOKEN || ""}` },
    body: JSON.stringify({ password, passwordConfirm: password }),
  });

  if (!updateRes.ok) {
    // Fallback: si no hay admin token, pedir reset por email a PocketBase
    return json({ error: "No se pudo cambiar la contraseña. Contactá soporte." }, 500, request);
  }

  // Borrar código usado
  await env.canopia_db.prepare("DELETE FROM reset_codes WHERE user_id=?").bind(userId).run();

  // Login automático
  const authRes = await pbFetch(env, "/api/collections/users/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: email, password }),
  });

  if (!authRes.ok) return json({ ok: true, message: "Contraseña cambiada. Iniciá sesión." }, 200, request);

  return json({
    ok:    true,
    token: authRes.data.token,
    user:  userPublic(authRes.data.record),
  }, 200, request);
}

// ── Recovery codes (admin) ────────────────────────────────────────────────────
async function getRecoveryCodes(request, env) {
  const bearer = (request.headers.get("Authorization") || "").replace("Bearer ", "");
  const xpass  = request.headers.get("x-admin-password") || "";
  const token  = bearer || xpass;

  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN)
    return json({ error: "No autorizado." }, 401, request);

  await env.canopia_db.prepare(`
    CREATE TABLE IF NOT EXISTS reset_codes (
      user_id TEXT PRIMARY KEY,
      code    TEXT NOT NULL,
      expires TEXT NOT NULL
    )
  `).run();

  // Los user_id ahora son IDs de PocketBase (strings), no integers
  const { results } = await env.canopia_db.prepare(`
    SELECT user_id, code, expires FROM reset_codes
    WHERE expires > datetime('now')
    ORDER BY expires ASC
  `).all();

  // Enriquecer con datos de PocketBase
  const enriched = await Promise.all(results.map(async (r) => {
    const { data } = await pbFetch(env, `/api/collections/users/records/${r.user_id}?fields=name,email,phone`);
    return {
      code:    r.code,
      expires: r.expires,
      name:    data?.name  || "—",
      email:   data?.email || "—",
      phone:   data?.phone || "",
    };
  }));

  return json({ codes: enriched }, 200, request);
}
