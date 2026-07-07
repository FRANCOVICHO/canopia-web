const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-password",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors });
}

export async function onRequestPost({ request, env }) {
  const body       = await request.json().catch(() => ({}));
  const event      = String(body.event      || "pageview").trim();
  const product_id = String(body.product_id || "").trim() || null;

  await env.canopia_db
    .prepare("INSERT INTO analytics (event, product_id) VALUES (?, ?)")
    .bind(event, product_id)
    .run();

  return new Response(null, { status: 204, headers: cors });
}

export async function onRequestGet({ request, env }) {
  // Acepta Authorization: Bearer TOKEN o x-admin-password: TOKEN
  const bearer = (request.headers.get("Authorization") || "").replace("Bearer ", "");
  const xpass  = request.headers.get("x-admin-password") || "";
  const token  = bearer || xpass;
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN)
    return Response.json({ error: "No autorizado." }, { status: 401, headers: cors });

  const url    = new URL(request.url);
  const days   = Math.min(Number(url.searchParams.get("days") || 30), 90);

  const { results } = await env.canopia_db.prepare(`
    SELECT
      event,
      product_id,
      strftime('%H', created_at)       AS hour,
      strftime('%Y-%m-%d', created_at) AS day,
      COUNT(*)                         AS count
    FROM analytics
    WHERE created_at >= date('now', '-${days} days')
    GROUP BY event, product_id, day, hour
    ORDER BY day DESC, hour ASC
  `).all();

  // Totales rápidos
  const totals = await env.canopia_db.prepare(`
    SELECT
      event,
      COUNT(*) AS total
    FROM analytics
    WHERE created_at >= date('now', '-${days} days')
    GROUP BY event
  `).all();

  // Top productos vistos
  const topProducts = await env.canopia_db.prepare(`
    SELECT
      product_id,
      COUNT(*) AS views
    FROM analytics
    WHERE event = 'product_view'
      AND product_id IS NOT NULL
      AND created_at >= date('now', '-${days} days')
    GROUP BY product_id
    ORDER BY views DESC
    LIMIT 10
  `).all();

  return Response.json({
    analytics:   results,
    totals:      totals.results,
    topProducts: topProducts.results,
    days,
  }, { headers: cors });
}
