import { buildProductHtml, buildErrorHtml } from "../_lib/seo.js";

/**
 * SSR handler for /producto/{id}
 * Queries D1, returns full HTML with SEO metadata + embedded SPA.
 *
 * @param {{ request: Request, env: object, params: object }} context
 * @returns {Promise<Response>}
 */
export async function onRequestGet({ request, env, params }) {
  const id = params.id;

  // ── 1. Query D1 ────────────────────────────────────────────────────────────
  let product;
  try {
    product = await env.canopia_db
      .prepare(
        `SELECT id, name, category, description, price, tag, image, visible, updated_at
         FROM products
         WHERE id = ?
         LIMIT 1`,
      )
      .bind(id)
      .first();
  } catch {
    const html = buildErrorHtml(
      500,
      "Error del servidor",
      "No pudimos cargar la información del producto. Intentá de nuevo más tarde.",
    );
    return new Response(html, {
      status: 500,
      headers: { "Content-Type": "text/html; charset=UTF-8" },
    });
  }

  // ── 2. Product not found → 404 ─────────────────────────────────────────────
  if (!product) {
    const html = buildErrorHtml(
      404,
      "Página no encontrada",
      "El producto que buscás no existe o fue eliminado.",
    );
    return new Response(html, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=UTF-8" },
    });
  }

  // ── 3. Product hidden → 301 redirect ──────────────────────────────────────
  if (product.visible === 0 || product.visible === "0") {
    return new Response(null, {
      status: 301,
      headers: { Location: "https://canopiagrow.com/" },
    });
  }

  // ── 4. Fetch SPA HTML ──────────────────────────────────────────────────────
  let spaHtml = "";
  try {
    const spaResponse = await env.ASSETS.fetch(
      new Request("https://placeholder/index.html"),
    );
    spaHtml = await spaResponse.text();
  } catch {
    // If ASSETS binding fails, continue with empty SPA shell — SSR content
    // is still fully usable for crawlers and will degrade gracefully.
    spaHtml = "";
  }

  // ── 5. Build and return full HTML ──────────────────────────────────────────
  const html = buildProductHtml(product, spaHtml);
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=UTF-8" },
  });
}
