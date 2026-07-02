export async function onRequestPost({ request, env }) {
  const payload = await request.json().catch(() => null);
  if (!payload?.items?.length) {
    return Response.json({ error: "El carrito esta vacio." }, { status: 400 });
  }

  const customerName = String(payload.customer?.name || "").trim();
  const customerPhone = String(payload.customer?.phone || "").trim();
  const customerNote = String(payload.customer?.note || "").trim();
  const userId = payload.user_id ? Number(payload.user_id) : null;

  if (!customerName || !customerPhone) {
    return Response.json({ error: "Falta nombre o telefono." }, { status: 400 });
  }

  const items = payload.items
    .map((item) => ({
      id: String(item.id || "").trim(),
      quantity: Math.max(1, Number(item.quantity || 1)),
    }))
    .filter((item) => item.id);

  if (!items.length) {
    return Response.json({ error: "El carrito esta vacio." }, { status: 400 });
  }

  const ids = items.map((item) => item.id);
  const placeholders = ids.map(() => "?").join(",");
  const { results: products } = await env.canopia_db
    .prepare(`SELECT id, name, price, stock FROM products WHERE id IN (${placeholders}) AND visible = 1`)
    .bind(...ids)
    .all();

  const productMap = new Map(products.map((product) => [product.id, product]));
  const enrichedItems = [];
  let total = 0;

  for (const item of items) {
    const product = productMap.get(item.id);
    if (!product) {
      return Response.json({ error: `Producto no disponible: ${item.id}` }, { status: 400 });
    }
    if (product.stock < item.quantity) {
      return Response.json(
        { error: `Stock insuficiente para ${product.name}. Disponible: ${product.stock}` },
        { status: 409 },
      );
    }
    const subtotal = product.price * item.quantity;
    total += subtotal;
    enrichedItems.push({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: item.quantity,
      subtotal,
    });
  }

  const statements = enrichedItems.map((item) =>
    env.canopia_db
      .prepare("UPDATE products SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND stock >= ?")
      .bind(item.quantity, item.id, item.quantity),
  );

  statements.push(
    env.canopia_db
      .prepare(
        `INSERT INTO orders (customer_name, customer_phone, customer_note, total, items_json, user_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(customerName, customerPhone, customerNote, total, JSON.stringify(enrichedItems), userId),
  );

  await env.canopia_db.batch(statements);

  return Response.json({
    ok: true,
    total,
    items: enrichedItems,
    customer: { name: customerName, phone: customerPhone, note: customerNote },
  });
}
