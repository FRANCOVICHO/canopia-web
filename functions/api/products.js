import { checkAdmin } from "../_lib/auth.js";

function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    price: row.price,
    tag: row.tag,
    image: row.image,
    featured: Boolean(row.featured),
    visible: Boolean(row.visible),
    stock: row.stock,
    updated_at: row.updated_at,
  };
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function getCatalogMeta(env) {
  const row = await env.canopia_db
    .prepare("SELECT MAX(updated_at) AS updatedAt FROM products")
    .first();
  return row?.updatedAt || null;
}

export async function onRequestGet({ request, env }) {
  const isAdmin = checkAdmin(request, env).ok;
  const query = isAdmin
    ? `SELECT id, name, category, description, price, tag, image, featured, visible, stock, updated_at
       FROM products
       ORDER BY featured DESC, name ASC`
    : `SELECT id, name, category, description, price, tag, image, featured, visible, stock, updated_at
       FROM products
       WHERE visible = 1
       ORDER BY featured DESC, name ASC`;

  const { results } = await env.canopia_db.prepare(query).all();

  return Response.json(
    {
      products: results.map(mapProduct),
      updatedAt: await getCatalogMeta(env),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function onRequestPost({ request, env }) {
  const auth = checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.name) {
    return Response.json({ error: "Falta el nombre del producto." }, { status: 400 });
  }

  const id = String(body.id || slugify(body.name)).trim();
  if (!id) return Response.json({ error: "ID invalido." }, { status: 400 });

  const existing = await env.canopia_db.prepare("SELECT id FROM products WHERE id = ?").bind(id).first();
  if (existing) {
    return Response.json({ error: "Ya existe un producto con ese ID." }, { status: 409 });
  }

  await env.canopia_db
    .prepare(
      `INSERT INTO products (id, name, category, description, price, tag, image, featured, visible, stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      String(body.name).trim(),
      String(body.category || "parafernalia").trim(),
      String(body.description || "").trim(),
      Math.max(0, Number(body.price || 0)),
      String(body.tag || "Producto").trim(),
      String(body.image || "").trim(),
      body.featured ? 1 : 0,
      body.visible === false ? 0 : 1,
      Math.max(0, Number(body.stock || 0)),
    )
    .run();

  const product = await env.canopia_db
    .prepare(
      `SELECT id, name, category, description, price, tag, image, featured, visible, stock, updated_at
       FROM products WHERE id = ?`,
    )
    .bind(id)
    .first();

  return Response.json({
    ok: true,
    product: mapProduct(product),
    updatedAt: await getCatalogMeta(env),
  });
}

export async function onRequestPut({ request, env }) {
  const auth = checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id = String(body?.id || "").trim();
  if (!id) return Response.json({ error: "Falta el ID del producto." }, { status: 400 });

  const existing = await env.canopia_db.prepare("SELECT id FROM products WHERE id = ?").bind(id).first();
  if (!existing) return Response.json({ error: "Producto no encontrado." }, { status: 404 });

  await env.canopia_db
    .prepare(
      `UPDATE products
       SET name = ?, category = ?, description = ?, price = ?, tag = ?, image = ?,
           featured = ?, visible = ?, stock = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(
      String(body.name || "").trim(),
      String(body.category || "parafernalia").trim(),
      String(body.description || "").trim(),
      Math.max(0, Number(body.price || 0)),
      String(body.tag || "Producto").trim(),
      String(body.image || "").trim(),
      body.featured ? 1 : 0,
      body.visible === false ? 0 : 1,
      Math.max(0, Number(body.stock || 0)),
      id,
    )
    .run();

  const product = await env.canopia_db
    .prepare(
      `SELECT id, name, category, description, price, tag, image, featured, visible, stock, updated_at
       FROM products WHERE id = ?`,
    )
    .bind(id)
    .first();

  return Response.json({
    ok: true,
    product: mapProduct(product),
    updatedAt: await getCatalogMeta(env),
  });
}

export async function onRequestDelete({ request, env }) {
  const auth = checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "Falta el ID del producto." }, { status: 400 });

  const result = await env.canopia_db.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
  if (!result.meta.changes) {
    return Response.json({ error: "Producto no encontrado." }, { status: 404 });
  }

  return Response.json({
    ok: true,
    deleted: id,
    updatedAt: await getCatalogMeta(env),
  });
}
