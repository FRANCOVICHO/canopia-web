import { checkAdmin } from "../_lib/auth.js";
import { cartItems, changePendingOrder } from "../_lib/order-integrity.js";
import { getToken, pbVerifyToken } from "../_lib/pocketbase.js";

const CORS = { "Cache-Control": "no-store" };

// ── POST /api/orders  →  crea pedido en estado "pendiente" (SIN descontar stock)
export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  // Confirmación desde el admin
  if (action === "confirm" || action === "reject") return updateOrderStatus(request, env, action);
  if (action) return Response.json({ error: "Acción inválida." }, { status: 400, headers: CORS });

  // Creación de pedido nuevo (flujo del cliente)
  const payload = await request.json().catch(() => null);
  if (!payload?.items?.length)
    return Response.json({ error: "El carrito esta vacio." }, { status: 400, headers: CORS });

  const customerName  = String(payload.customer?.name  || "").trim();
  const customerPhone = String(payload.customer?.phone || "").trim();
  const customerNote  = String(payload.customer?.note  || "").trim();
  const token = getToken(request);
  const user = token ? await pbVerifyToken(env, token) : null;
  if (token && !user) {
    return Response.json({ error: "La sesión venció. Volvé a iniciar sesión." }, { status: 401, headers: CORS });
  }
  const userId = user?.id || null;

  if (!customerName || customerName.length > 120 || !customerPhone || customerPhone.length > 40 || customerNote.length > 1000)
    return Response.json({ error: "Falta nombre o telefono." }, { status: 400, headers: CORS });

  const items = cartItems(payload.items);
  if (!items) {
    return Response.json({ error: "El carrito contiene cantidades o productos inválidos." }, { status: 400, headers: CORS });
  }

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
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401, headers: CORS });

  const url    = new URL(request.url);
  const status = url.searchParams.get("status") || "pendiente";
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit"), 10) || 50, 1), 200);

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

async function updateOrderStatus(request, env, action) {
  const auth = await checkAdmin(request, env);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 401, headers: CORS });

  const body = await request.json().catch(() => null);
  const orderId = Number(body?.order_id);
  if (!Number.isSafeInteger(orderId) || orderId < 1) {
    return Response.json({ error: "Falta order_id." }, { status: 400, headers: CORS });
  }
  const order = await env.canopia_db.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();
  if (!order) return Response.json({ error: "Pedido no encontrado." }, { status: 404, headers: CORS });
  const status = action === "confirm" ? "confirmado" : "rechazado";
  if (order.status !== "pendiente" || !await changePendingOrder(env.canopia_db, order, status)) {
    return Response.json({ error: "El pedido cambió de estado o ya no hay stock suficiente." },
      { status: 409, headers: CORS });
  }
  return Response.json({ ok: true, order_id: orderId, status }, { headers: CORS });
}
