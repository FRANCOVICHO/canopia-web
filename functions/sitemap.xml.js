import { buildSitemapXml } from "./_lib/seo.js";

/**
 * Sitemap dinámico — consulta D1 y devuelve XML con todas las URLs públicas.
 * Ruta: GET /sitemap.xml
 */
export async function onRequestGet({ env }) {
  try {
    const [productsResult, categoriesResult] = await Promise.all([
      env.canopia_db
        .prepare(
          "SELECT id, updated_at FROM products WHERE visible = 1 ORDER BY name ASC"
        )
        .all(),
      env.canopia_db
        .prepare(
          "SELECT name FROM categories ORDER BY sort_order ASC, name ASC"
        )
        .all(),
    ]);

    const xml = buildSitemapXml(
      productsResult.results,
      categoriesResult.results
    );

    return new Response(xml, {
      status: 200,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  } catch (err) {
    const errorXml = `<?xml version="1.0" encoding="UTF-8"?>
<error>
  <message>Error al generar el sitemap. Por favor intente nuevamente.</message>
</error>`;

    return new Response(errorXml, {
      status: 500,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }
}
