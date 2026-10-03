/**
 * Módulo de utilidades SEO compartidas para Cloudflare Functions.
 * Usado por las SSR Functions de producto, categoría y sitemap.
 */

// ─── Constante global ───────────────────────────────────────────────────────

export const SITE_BASE_URL = "https://canopiagrow.com";

// ─── Sanitización XSS ───────────────────────────────────────────────────────

/**
 * Escapa los caracteres HTML especiales para prevenir XSS.
 * Coerce inputs no-string a string antes de escapar.
 *
 * @param {*} str
 * @returns {string}
 */
export function escapeHtml(str) {
  const s = String(str == null ? "" : str);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Utilidades de string ────────────────────────────────────────────────────

/**
 * Convierte un string a slug URL-safe:
 * - Minúsculas
 * - Elimina diacríticos (NFD + strip combining marks)
 * - Reemplaza secuencias de caracteres no alfanuméricos con guiones
 * - Elimina guiones al inicio y al final
 *
 * @param {string} str
 * @returns {string}
 */
export function slugify(str) {
  return String(str == null ? "" : str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Trunca un string a `maxLen` caracteres.
 * Si se trunca, agrega el carácter de elipsis `…` (un solo carácter Unicode)
 * dentro del límite de `maxLen`.
 *
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
export function truncate(str, maxLen) {
  const s = String(str == null ? "" : str);
  if (s.length <= maxLen) return s;
  // Deja espacio para el carácter `…`
  return s.slice(0, maxLen - 1) + "…";
}

// ─── Constructores de HTML ───────────────────────────────────────────────────

/**
 * Construye el HTML completo para una página SSR de producto.
 *
 * @param {object} product - Objeto producto de D1
 * @param {string} spaHtml - HTML completo del index.html de la SPA
 * @returns {string}
 */
export function buildProductHtml(product, spaHtml) {
  const name        = escapeHtml(product.name);
  const description = escapeHtml(truncate(product.description, 160));
  const image       = escapeHtml(product.image);
  const id          = escapeHtml(product.id);
  const category    = escapeHtml(product.category);
  const price       = Number(product.price);
  const canonical   = `${SITE_BASE_URL}/producto/${id}`;

  // JSON-LD — sin escapeHtml aquí: los valores se serializan con JSON.stringify
  const productSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: truncate(product.description, 160),
    image: product.image,
    url: canonical,
    offers: {
      "@type": "Offer",
      price: price.toFixed(2),
      priceCurrency: "ARS",
      availability: "https://schema.org/InStock",
    },
  });

  const breadcrumbSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_BASE_URL + "/" },
      { "@type": "ListItem", position: 2, name: product.name, item: canonical },
    ],
  });

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name} — CanopiaGrow</title>
  <meta name="description" content="${description}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${canonical}">

  <!-- Open Graph -->
  <meta property="og:type" content="product">
  <meta property="og:site_name" content="CanopiaGrow">
  <meta property="og:locale" content="es_AR">
  <meta property="og:url" content="${canonical}">
  <meta property="og:title" content="${name} — CanopiaGrow">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:alt" content="${name}">
  <meta property="product:price:amount" content="${price.toFixed(2)}">
  <meta property="product:price:currency" content="ARS">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@canopiagrow">
  <meta name="twitter:title" content="${name} — CanopiaGrow">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${image}">
  <meta name="twitter:image:alt" content="${name}">

  <!-- JSON-LD Product -->
  <script type="application/ld+json">${productSchema}</script>

  <!-- JSON-LD Breadcrumb -->
  <script type="application/ld+json">${breadcrumbSchema}</script>
</head>
<body>
  <div id="ssr-product">
    <p><a href="${SITE_BASE_URL}/">← Volver a CanopiaGrow</a></p>
    <h1>${name}</h1>
    <p>${description}</p>
    <img src="${image}" alt="${name}" loading="eager">
    <p><strong>Categoría:</strong> ${category}</p>
  </div>
  ${spaHtml}
</body>
</html>`;
}

/**
 * Construye el HTML completo para una página SSR de categoría.
 *
 * @param {object} category - Objeto categoría de D1
 * @param {Array}  products - Lista de productos visibles de esa categoría
 * @param {string} spaHtml  - HTML completo del index.html de la SPA
 * @returns {string}
 */
export function buildCategoryHtml(category, products, spaHtml) {
  const categorySlug = slugify(category.name);
  const name         = escapeHtml(category.name);
  const description  = escapeHtml(truncate(category.description || "", 160));
  const canonical    = `${SITE_BASE_URL}/categoria/${categorySlug}`;

  // JSON-LD ItemList — máximo 10 productos
  const itemList = products.slice(0, 10).map((p, i) => ({
    "@type": "ListItem",
    position: i + 1,
    item: {
      "@type": "Product",
      name: p.name,
      url: `${SITE_BASE_URL}/producto/${p.id}`,
      image: p.image,
    },
  }));

  const itemListSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: category.name,
    url: canonical,
    itemListElement: itemList,
  });

  const breadcrumbSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_BASE_URL + "/" },
      { "@type": "ListItem", position: 2, name: category.name, item: canonical },
    ],
  });

  const productRows = products
    .map(p => {
      const pName  = escapeHtml(p.name);
      const pImg   = escapeHtml(p.image);
      const pPrice = Number(p.price).toFixed(2);
      const pId    = escapeHtml(p.id);
      const pAlt   = `\${pName} — \${name}`;
      return `    <div class="ssr-product-card">
      <img src="${pImg}" alt="${pAlt}" loading="lazy">
      <h2>${pName}</h2>
      <p>$${pPrice} ARS</p>
      <a href="${SITE_BASE_URL}/producto/${pId}">Ver producto</a>
    </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name} — CanopiaGrow | Grow Shop &amp; Smoke Shop</title>
  <meta name="description" content="${description || `Explorá ${name} en CanopiaGrow: grow shop y smoke shop online con envíos a todo el país.`}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${canonical}">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="CanopiaGrow">
  <meta property="og:locale" content="es_AR">
  <meta property="og:url" content="${canonical}">
  <meta property="og:title" content="${name} — CanopiaGrow">
  <meta property="og:description" content="${description || `Explorá ${name} en CanopiaGrow: grow shop y smoke shop online con envíos a todo el país.`}">
  <meta property="og:image" content="${SITE_BASE_URL}/assets/hero.png">
  <meta property="og:image:alt" content="${name} — CanopiaGrow">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@canopiagrow">
  <meta name="twitter:title" content="${name} — CanopiaGrow">
  <meta name="twitter:description" content="${description || `Explorá ${name} en CanopiaGrow.`}">
  <meta name="twitter:image" content="${SITE_BASE_URL}/assets/hero.png">
  <meta name="twitter:image:alt" content="${name} — CanopiaGrow">

  <!-- JSON-LD ItemList -->
  <script type="application/ld+json">${itemListSchema}</script>

  <!-- JSON-LD Breadcrumb -->
  <script type="application/ld+json">${breadcrumbSchema}</script>
</head>
<body>
  <div id="ssr-category">
    <p><a href="${SITE_BASE_URL}/">← Volver a CanopiaGrow</a></p>
    <h1>${name}</h1>
    <p>${description}</p>
    <div class="ssr-product-grid">
${productRows}
    </div>
  </div>
  ${spaHtml}
</body>
</html>`;
}

/**
 * Construye el HTML para páginas de error (404, 500, etc.).
 *
 * @param {number} statusCode
 * @param {string} title
 * @param {string} message
 * @returns {string}
 */
export function buildErrorHtml(statusCode, title, message) {
  const safeTitle   = escapeHtml(title);
  const safeMessage = escapeHtml(message);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle} — Canopia</title>
  <style>
    body { font-family: sans-serif; background: #0d0f10; color: #e5e7eb; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    main { text-align: center; padding: 2rem; }
    h1 { font-size: 2rem; margin-bottom: 1rem; }
    a { color: #86efac; }
  </style>
</head>
<body>
  <main>
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
    <a href="${SITE_BASE_URL}/">← Volver a la tienda</a>
  </main>
</body>
</html>`;
}

// ─── Constructor de Sitemap ──────────────────────────────────────────────────

/**
 * Construye el XML del sitemap con todas las URLs públicas.
 *
 * @param {Array} products   - Productos visibles (con id y updated_at)
 * @param {Array} categories - Todas las categorías (con name)
 * @returns {string}
 */
export function buildSitemapXml(products, categories) {
  const esc = s => String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  const today = new Date().toISOString().split("T")[0];
  const urls = [];

  // Home
  urls.push(`  <url>
    <loc>${SITE_BASE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`);

  // Nosotros / About
  urls.push(`  <url>
    <loc>${SITE_BASE_URL}/#nosotros</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`);

  // Categorías
  for (const category of categories) {
    const loc = esc(`${SITE_BASE_URL}/categoria/${slugify(category.name)}`);
    urls.push(`  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
  }

  // Productos
  for (const product of products) {
    const loc     = esc(`${SITE_BASE_URL}/producto/${product.id}`);
    const lastmod = product.updated_at
      ? esc(new Date(product.updated_at).toISOString().split("T")[0])
      : today;
    urls.push(`  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join("\n")}
</urlset>`;
}
