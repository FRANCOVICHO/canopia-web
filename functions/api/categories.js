import { checkAdmin } from "../_lib/auth.js";

const CORS = { "Content-Type": "application/json" };

export async function onRequestGet({ env }) {
  const { results } = await env.canopia_db
    .prepare("SELECT name, description, sort_order FROM categories ORDER BY sort_order ASC, name ASC")
    .all();
  return Response.json({ categories: results }, { headers: CORS });
}

export async function onRequestPost({ request, env }) {
  const auth = checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401, headers: CORS });

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const sort_order = Number(body.sort_order || 0);

  if (!name) return Response.json({ error: "Falta el nombre." }, { status: 400, headers: CORS });

  const existing = await env.canopia_db
    .prepare("SELECT name FROM categories WHERE name = ?").bind(name).first();
  if (existing) return Response.json({ error: "Ya existe esa categoría." }, { status: 409, headers: CORS });

  await env.canopia_db
    .prepare("INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)")
    .bind(name, description, sort_order).run();

  const { results } = await env.canopia_db
    .prepare("SELECT name, description, sort_order FROM categories ORDER BY sort_order ASC, name ASC")
    .all();
  return Response.json({ ok: true, categories: results }, { status: 201, headers: CORS });
}

export async function onRequestPut({ request, env }) {
  const auth = checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401, headers: CORS });

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return Response.json({ error: "Falta el nombre." }, { status: 400, headers: CORS });

  await env.canopia_db
    .prepare("UPDATE categories SET description = ?, sort_order = ? WHERE name = ?")
    .bind(String(body.description || "").trim(), Number(body.sort_order || 0), name).run();

  const { results } = await env.canopia_db
    .prepare("SELECT name, description, sort_order FROM categories ORDER BY sort_order ASC, name ASC")
    .all();
  return Response.json({ ok: true, categories: results }, { headers: CORS });
}

export async function onRequestDelete({ request, env }) {
  const auth = checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401, headers: CORS });

  const name = new URL(request.url).searchParams.get("name")?.trim();
  if (!name) return Response.json({ error: "Falta el nombre." }, { status: 400, headers: CORS });

  await env.canopia_db.prepare("DELETE FROM categories WHERE name = ?").bind(name).run();

  const { results } = await env.canopia_db
    .prepare("SELECT name, description, sort_order FROM categories ORDER BY sort_order ASC, name ASC")
    .all();
  return Response.json({ ok: true, categories: results }, { headers: CORS });
}
