import { checkAdmin } from "../_lib/auth.js";

const CORS = { "Content-Type": "application/json" };

// ── POST /api/orders  →  crea pedido en estado "pendiente" (SIN descontar stock)
export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  // Confirmación desde el admin
  if (action === "confirm") return confirmOrder(request, env);
  if (action === "reject")  return rejectOrder(request, env);

  // Creación de pedido nuevo (flujo del cliente)
  const payload = await request.json().catch(() => null);
  if (!payload?.items?.length)
    return Response.json({ error: "El carrito esta vacio." }, { status: 400, headers: CORS });

  const customerName  = String(payload.customer?.name  || "").trim();
  const customerPhone = String(payload.customer?.phone || "").trim();
  const customerNote  = String(payload.customer?.note  || "").trim();
  const userId        = payload.user_id ? Number(payload.user_id) : null;

  if (!customerName || !customerPhone)
    return Response.json({ error: "Falta nombre o telefono." }, { status: 400, headers: CORS });

  const items = payload.items
    .map((item) => ({ id: String(item.id || "").trim(), quantity: Math.max(1, Number(item.quantity || 1)) }))
    .filter((item) => item.id);

  if (!items.length)
    return Response.json({ error: "El carrito esta vacio." }, { status: 400, headers: CORS });

  // Validar productos y armar resumen (NO descontar stock todavía)
  const ids = items.map((i) => i.id);
  const placeholders = ids.map(() => "?").join(",");
  const { results: dbProducts } = await env.canopia_db
    .prepare(`SELECT id, name, price, stock FROM products WHERE id IN (${placeholders}) AND visible = 1`)
    .bind(...ids).all();

  const productMap = new Map(dbProducts.map((p) => [p.id, p]));
  const enrichedItems = [];
  let total = 0;

  for (const item of items) {
    const product = productMap.get(item.id);
    if (!product)
      return Response.json({ error: `Producto no disponible: ${item.id}` }, { status: 400, headers: CORS });
    if (product.stock < item.quantity)
      return Response.json(
        { error: `Stock insuficiente para ${product.name}. Disponible: ${product.stock}` },
        { status: 409, headers: CORS },
      );
    const subtotal = product.price * item.quantity;
    total += subtotal;
    enrichedItems.push({ id: product.id, name: product.name, price: product.price, quantity: item.quantity, subtotal });
  }

  // Guardar pedido como "pendiente" — stock intacto hasta que el admin confirme
  const result = await env.canopia_db
    .prepare(
      `INSERT INTO orders (customer_name, customer_phone, customer_note, total, items_json, status, user_id)
       VALUES (?, ?, ?, ?, ?, 'pendiente', ?)`,
    )
    .bind(customerName, customerPhone, customerNote, total, JSON.stringify(enrichedItems), userId)
    .run();

  return Response.json({
    ok: true,
    order_id: result.meta?.last_row_id,
    total,
    items: enrichedItems,
    customer: { name: customerName, phone: customerPhone, note: customerNote },
    status: "pendiente",
  }, { headers: CORS });
}

// ── GET /api/orders  →  lista pedidos (admin) ─────────────────────────────────
export async function onRequestGet({ request, env }) {
  const auth = checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401, headers: CORS });

  const url    = new URL(request.url);
  const status = url.searchParams.get("status") || "pendiente";
  const limit  = Math.min(Number(url.searchParams.get("limit") || 50), 200);

  const query = status === "todos"
    ? `SELECT * FROM orders ORDER BY created_at DESC LIMIT ?`
    : `SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT ?`;

  const { results } = status === "todos"
    ? await env.canopia_db.prepare(query).bind(limit).all()
    : await env.canopia_db.prepare(query).bind(status, limit).all();

  const orders = results.map((o) => ({
    id:         o.id,
    customer_name:  o.customer_name,
    customer_phone: o.customer_phone,
    customer_note:  o.customer_note,
    total:      o.total,
    status:     o.status,
    items:      JSON.parse(o.items_json || "[]"),
    created_at: o.created_at,
  }));

  return Response.json({ orders }, { headers: CORS });
}

// ── Confirmar pedido (descuenta stock) ────────────────────────────────────────
async function confirmOrder(request, env) {
  const auth = checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401, headers: CORS });

  const body    = await request.json().catch(() => ({}));
  const orderId = Number(body.order_id || 0);
  if (!orderId) return Response.json({ error: "Falta order_id." }, { status: 400, headers: CORS });

  const order = await env.canopia_db
    .prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();
  if (!order) return Response.json({ error: "Pedido no encontrado." }, { status: 404, headers: CORS });
  if (order.status !== "pendiente")
    return Response.json({ error: `El pedido ya está ${order.status}.` }, { status: 409, headers: CORS });

  const items = JSON.parse(order.items_json || "[]");

  // Verificar stock antes de descontar
  for (const item of items) {
    const row = await env.canopia_db
      .prepare("SELECT stock FROM products WHERE id = ?").bind(item.id).first();
    if (!row) return Response.json({ error: `Producto no encontrado: ${item.id}` }, { status: 400, headers: CORS });
    if (row.stock < item.quantity)
      return Response.json(
        { error: `Stock insuficiente para ${item.name}. Disponible: ${row.stock}` },
        { status: 409, headers: CORS },
      );
  }

  // Descontar stock + actualizar estado en batch
  const statements = items.map((item) =>
    env.canopia_db
      .prepare("UPDATE products SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND stock >= ?")
      .bind(item.quantity, item.id, item.quantity),
  );
  statements.push(
    env.canopia_db
      .prepare("UPDATE orders SET status = 'confirmado' WHERE id = ?")
      .bind(orderId),
  );
  await env.canopia_db.batch(statements);

  return Response.json({ ok: true, order_id: orderId, status: "confirmado" }, { headers: CORS });
}

// ── Rechazar pedido (no descuenta nada) ───────────────────────────────────────
async function rejectOrder(request, env) {
  const auth = checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401, headers: CORS });

  const body    = await request.json().catch(() => ({}));
  const orderId = Number(body.order_id || 0);
  if (!orderId) return Response.json({ error: "Falta order_id." }, { status: 400, headers: CORS });

  const order = await env.canopia_db
    .prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first();
  if (!order) return Response.json({ error: "Pedido no encontrado." }, { status: 404, headers: CORS });
  if (order.status !== "pendiente")
    return Response.json({ error: `El pedido ya está ${order.status}.` }, { status: 409, headers: CORS });

  await env.canopia_db
    .prepare("UPDATE orders SET status = 'rechazado' WHERE id = ?").bind(orderId).run();

  return Response.json({ ok: true, order_id: orderId, status: "rechazado" }, { headers: CORS });
}
