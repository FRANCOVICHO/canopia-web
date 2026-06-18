export async function onRequestGet({ env }) {
  const { results } = await env.canopia_db
    .prepare(
      `SELECT id, name, category, description, price, tag, image, featured, visible, stock
       FROM products
       WHERE visible = 1
       ORDER BY featured DESC, name ASC`,
    )
    .all();

  return Response.json({
    products: results.map((product) => ({
      ...product,
      featured: Boolean(product.featured),
      visible: Boolean(product.visible),
    })),
  });
}
