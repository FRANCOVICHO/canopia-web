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
 *   POST ?action=forgot         — Solicita el correo de recuperación a PocketBase
 */

import { getToken, pbFetch, pbVerifyToken } from "../_lib/pocketbase.js";

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
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function json(data, status = 200, req) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(req) });
}

// ── Router ────────────────────────────────────────────────────────────────────
export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: corsHeaders(request) });

  const action = new URL(request.url).searchParams.get("action");

  try {
    if (request.method === "POST" && action === "register")        return await register(request, env);
    if (request.method === "POST" && action === "login")           return await login(request, env);
    if (request.method === "GET"  && action === "me")              return await me(request, env);
    if (request.method === "PUT"  && action === "profile")         return await updateProfile(request, env);
    if (request.method === "GET"  && action === "orders")          return await myOrders(request, env);
    if (request.method === "POST" && action === "address")         return await saveAddress(request, env);
    if (request.method === "GET"  && action === "addresses")       return await getAddresses(request, env);
    if (request.method === "DELETE" && action === "address")       return await deleteAddress(request, env);
    if (request.method === "POST" && action === "sync-favs")       return await syncFavs(request, env);
    if (request.method === "POST" && action === "forgot")          return await forgotPassword(request, env);
    if (action === "reset-password" || action === "recovery-codes") {
      return json({ error: "La recuperación ahora se realiza por correo electrónico." }, 410, request);
    }
    return json({ error: "Acción no encontrada." }, 404, request);
  } catch (err) {
    console.error("Auth operation failed", action);
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
    .prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50")
    .bind(user.id).all();

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
  const ids = Array.isArray(body.favs) ? [...new Set(body.favs
    .filter((id) => typeof id === "string" && id.length <= 256)
    .slice(0, 200))] : [];

  const result = await pbFetch(env, `/api/collections/users/records/${user.id}`, {
    method: "PATCH",
    headers: { Authorization: token },
    body: JSON.stringify({ favs_json: JSON.stringify(ids) }),
  });
  if (!result.ok) return json({ error: "No se pudieron guardar los favoritos." }, 400, request);

  return json({ ok: true, favs: ids }, 200, request);
}

// ── Recuperación de contraseña ────────────────────────────────────────────────
async function forgotPassword(request, env) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";

  if (email.length > 254 || !validEmail(email)) {
    return json({ error: "Email inválido." }, 400, request);
  }

  try {
    const result = await pbFetch(env, "/api/collections/users/request-password-reset", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    if (!result.ok && result.status >= 500) console.error("PocketBase password reset unavailable");
  } catch {
    console.error("PocketBase password reset unavailable");
  }
  return json({
    ok: true,
    message: "Si el correo está registrado, vas a recibir un enlace para cambiar la contraseña.",
  }, 200, request);
}
