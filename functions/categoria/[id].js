import { slugify, buildCategoryHtml, buildErrorHtml } from "../_lib/seo.js";

/**
 * SSR handler para páginas de categoría.
 * Route: /categoria/:id (donde :id es el slug de la categoría)
 *
 * Flujo:
 *  1. Obtiene todas las categorías de D1 y busca la que coincide por slug.
 *  2. Si no encuentra → 404.
 *  3. Consulta los productos visibles de esa categoría.
 *  4. Obtiene el HTML de la SPA desde env.ASSETS.
 *  5. Construye y devuelve el HTML SSR completo.
 *  6. Ante error de D1 → 500.
 */
export async function onRequestGet({ request, env, params }) {
  try {
    // 1. Buscar la categoría por slug
    const { results: allCategories } = await env.canopia_db
      .prepare("SELECT name, description, sort_order FROM categories ORDER BY sort_order ASC, name ASC")
      .all();

    const category = allCategories.find(
      (c) => slugify(c.name) === slugify(params.id)
    );

    // 2. Categoría no encontrada → 404
    if (!category) {
      const html = buildErrorHtml(
        404,
        "Página no encontrada",
        "La categoría que buscás no existe o fue removida."
      );
      return new Response(html, {
        status: 404,
        headers: { "Content-Type": "text/html; charset=UTF-8" },
      });
    }

    // 3. Consultar productos visibles de la categoría
    const { results: products } = await env.canopia_db
      .prepare(
        `SELECT id, name, description, price, image, tag
         FROM products
         WHERE category = ? AND visible = 1
         ORDER BY featured DESC, name ASC
         LIMIT 50`
      )
      .bind(category.name)
      .all();

    // 4. Obtener el HTML de la SPA
    const spaResponse = await env.ASSETS.fetch(
      new Request("https://placeholder/index.html")
    );
    const spaHtml = await spaResponse.text();

    // 5. Construir y devolver el HTML SSR completo
    const html = buildCategoryHtml(category, products, spaHtml);

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=UTF-8" },
    });
  } catch (err) {
    // 6. Error de D1 u otro error inesperado → 500
    const html = buildErrorHtml(
      500,
      "Error del servidor",
      "Ocurrió un error al cargar la categoría. Por favor, intentá de nuevo más tarde."
    );
    return new Response(html, {
      status: 500,
      headers: { "Content-Type": "text/html; charset=UTF-8" },
    });
  }
}
