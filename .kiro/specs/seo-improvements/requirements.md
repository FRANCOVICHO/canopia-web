# Documento de Requerimientos: Mejoras SEO — Canopia Grow Shop

## Introducción

Canopia Grow Shop (canopiagrow.com) es una SPA HTML/CSS/JS vanilla alojada en Cloudflare Pages con backend en Cloudflare Functions y base de datos D1 (SQLite). El sitio actual carece de metadatos SEO completos, no tiene URLs indexables por producto o categoría, y no cuenta con sitemap ni robots.txt optimizados.

Este spec cubre las mejoras de las **Opciones B + C**: mejoras globales de metadatos SEO en el HTML existente, y generación de páginas SSR (Server-Side Rendering) para productos y categorías mediante Cloudflare Functions. Estas mejoras deben aplicarse sin romper ninguna funcionalidad existente de la SPA.

---

## Glosario

- **System / SEO_System**: El conjunto de archivos nuevos y modificados que implementan las mejoras SEO.
- **SSR_Function**: Una Cloudflare Function (Pages Function) que renderiza HTML completo del lado del servidor.
- **SPA**: La Single Page Application existente en `index.html` + `app.js`.
- **D1**: La base de datos Cloudflare D1 (SQLite) vinculada como `canopia_db`.
- **Product_Page**: La página SSR generada para un producto individual, en `/producto/{id}`.
- **Category_Page**: La página SSR generada para una categoría, en `/categoria/{slug}`.
- **Sitemap_Function**: La Cloudflare Function que genera `/sitemap.xml` dinámicamente.
- **Canonical_URL**: La URL canónica y definitiva de una página, declarada en el `<head>`.
- **JSON-LD**: Formato de datos estructurados para motores de búsqueda (Schema.org).
- **OG**: Open Graph, protocolo de metadatos para redes sociales.
- **XSS**: Cross-Site Scripting, vulnerabilidad de inyección de HTML.
- **escapeHtml**: Función de utilidad que escapa caracteres especiales HTML para prevenir XSS.
- **SEO_Lib**: Módulo de utilidades compartidas en `functions/_lib/seo.js`.
- **slug**: Identificador de URL amigable (ej: `kit-inicio-grow`). En D1, el campo `id` de products ya es un slug.
- **category_slug**: Slug de categoría, derivado del campo `name` de la tabla `categories` mediante slugificación.
- **visible**: Campo INTEGER en la tabla `products` (1 = visible al público, 0 = oculto).

---

## Requerimientos

### Requerimiento 1: Metadatos SEO Globales en index.html

**User Story:** Como dueño del sitio, quiero que index.html incluya todos los metadatos SEO esenciales, para que los motores de búsqueda y las redes sociales muestren información correcta al indexar la página principal.

#### Criterios de Aceptación

1. THE SEO_System SHALL add a `<link rel="canonical" href="https://canopiagrow.com/">` tag inside the `<head>` of `index.html`.
2. THE SEO_System SHALL add `<meta property="og:title">`, `<meta property="og:description">`, `<meta property="og:url">`, `<meta property="og:type">`, and `<meta property="og:image">` tags to `index.html`.
3. THE SEO_System SHALL add `<meta name="twitter:card">`, `<meta name="twitter:title">`, `<meta name="twitter:description">`, and `<meta name="twitter:image">` tags to `index.html`.
4. THE SEO_System SHALL add `<meta name="theme-color" content="#0d0f10">` to `index.html`.
5. THE SEO_System SHALL add a `<link rel="preload" as="image">` tag for `assets/hero.png` in `index.html`.
6. THE SEO_System SHALL add a JSON-LD `<script type="application/ld+json">` block containing a `WebSite` schema with `SearchAction` to `index.html`.
7. THE SEO_System SHALL add a JSON-LD `<script type="application/ld+json">` block containing an `Organization` schema with name, URL, and logo to `index.html`.
8. THE SEO_System SHALL verify that `index.html` has `<html lang="es">` set correctly (already present; must not be removed).
9. WHEN adding SEO tags to `index.html`, THE SEO_System SHALL NOT modify any existing JavaScript logic, visual layout, or inline styles.

### Requerimiento 2: Favicon y Touch Icons

**User Story:** Como dueño del sitio, quiero que el sitio tenga favicon y apple-touch-icon correctamente configurados, para que los navegadores y dispositivos móviles muestren el ícono de Canopia.

#### Criterios de Aceptación

1. THE SEO_System SHALL add `<link rel="icon" type="image/png" sizes="32x32" href="/assets/logo-icon.png">` to `index.html`.
2. THE SEO_System SHALL add `<link rel="icon" type="image/png" sizes="16x16" href="/assets/logo-icon.png">` to `index.html`.
3. THE SEO_System SHALL add `<link rel="apple-touch-icon" sizes="180x180" href="/assets/logo-icon.png">` to `index.html`.
4. THE SEO_System SHALL add `<link rel="shortcut icon" href="/assets/logo-icon.png">` to `index.html`.

### Requerimiento 3: Optimización de Imágenes y Accesibilidad en index.html

**User Story:** Como usuario del sitio, quiero que las imágenes y controles tengan atributos `alt`, `width`, `height` y `aria-label` descriptivos, para que los lectores de pantalla y motores de búsqueda procesen el contenido correctamente.

#### Criterios de Aceptación

1. THE SEO_System SHALL add explicit `width` and `height` attributes to the `<img>` tag for `assets/hero.png` in `index.html`.
2. THE SEO_System SHALL add explicit `width` and `height` attributes to all `<img>` tags for `assets/logo-icon.png` in `index.html` and the footer.
3. WHEN category cards are rendered dynamically by `app.js`, THE SEO_System SHALL ensure the category image elements include descriptive `alt` text with the category name (implementado en la SSR_Function de categorías, no en app.js).
4. THE SEO_System SHALL NOT modify `app.js` to implement any SEO improvement.

### Requerimiento 4: robots.txt

**User Story:** Como administrador del sitio, quiero un archivo robots.txt correcto, para que los crawlers respeten las rutas privadas y encuentren el sitemap.

#### Criterios de Aceptación

1. THE SEO_System SHALL create a static `robots.txt` file at the root of the project.
2. THE `robots.txt` file SHALL allow crawling of `/`, `/producto/`, `/categoria/`, and `/assets/`.
3. THE `robots.txt` file SHALL disallow crawling of `/admin`, `/api/`, and `/_headers`.
4. THE `robots.txt` file SHALL include a `Sitemap:` directive pointing to `https://canopiagrow.com/sitemap.xml`.

### Requerimiento 5: Sitemap XML Dinámico

**User Story:** Como administrador del sitio, quiero un sitemap.xml dinámico que liste todas las URLs públicas actualizadas, para que los motores de búsqueda indexen el contenido de productos y categorías eficientemente.

#### Criterios de Aceptación

1. THE Sitemap_Function SHALL respond to GET requests at `/sitemap.xml` with a valid XML sitemap.
2. THE Sitemap_Function SHALL include the home URL (`https://canopiagrow.com/`) with `changefreq=weekly` and `priority=1.0`.
3. THE Sitemap_Function SHALL include one `<url>` entry per product with `visible=1` in D1, using the path `/producto/{product.id}`.
4. THE Sitemap_Function SHALL include one `<url>` entry per category in D1, using the path `/categoria/{category_slug}`, where the slug is derived from the category `name`.
5. THE Sitemap_Function SHALL set `<lastmod>` for product URLs to the product's `updated_at` value in ISO 8601 format.
6. THE Sitemap_Function SHALL NOT include URLs for `/admin`, `/api/*`, or any path containing authentication or cart logic.
7. THE Sitemap_Function SHALL return a `Content-Type: application/xml` response header.
8. IF the D1 query fails, THEN THE Sitemap_Function SHALL return an HTTP 500 response with an XML error body.

### Requerimiento 6: Página SSR de Producto

**User Story:** Como comprador que llega desde Google, quiero que cada producto tenga su propia URL con metadatos correctos, para que pueda ver el nombre, descripción e imagen del producto en los resultados de búsqueda antes de hacer clic.

#### Criterios de Aceptación

1. THE Product_Page SSR_Function SHALL respond to GET requests at `/producto/{id}` with a full HTML document.
2. THE Product_Page HTML SHALL include a `<title>` tag with the format `{product.name} — Canopia Grow Shop`.
3. THE Product_Page HTML SHALL include `<meta name="description">` with the product's description (truncated to 160 characters).
4. THE Product_Page HTML SHALL include `<link rel="canonical" href="https://canopiagrow.com/producto/{id}">`.
5. THE Product_Page HTML SHALL include complete Open Graph tags: `og:title`, `og:description`, `og:url`, `og:image`, `og:type` (set to `product`), and `og:price:amount`.
6. THE Product_Page HTML SHALL include Twitter Card tags: `twitter:card` (set to `summary_large_image`), `twitter:title`, `twitter:description`, and `twitter:image`.
7. THE Product_Page HTML SHALL include a JSON-LD `Product` schema with name, description, image, price, currency, availability, and URL.
8. THE Product_Page HTML SHALL include a JSON-LD `BreadcrumbList` schema with two items: home (`/`) and the product page (`/producto/{id}`).
9. THE Product_Page HTML SHALL embed the full SPA (`index.html` content) so the user can continue browsing after the SSR page loads.
10. WHEN a product ID does not exist in D1, THE SSR_Function SHALL return an HTTP 404 response with a clean HTML error page.
11. WHEN a product has `visible=0` in D1, THE SSR_Function SHALL return an HTTP 301 redirect to `https://canopiagrow.com/`.
12. THE SSR_Function SHALL sanitize ALL product data inserted into HTML output using `escapeHtml` to prevent XSS.
13. THE Product_Page HTML SHALL include a visible "← Volver a la tienda" link pointing to `https://canopiagrow.com/#catalogo`.

### Requerimiento 7: Página SSR de Categoría

**User Story:** Como comprador que busca "bongs Argentina" en Google, quiero encontrar una página de categoría de Canopia con productos listados, para que pueda navegar directamente a los productos que me interesan.

#### Criterios de Aceptación

1. THE Category_Page SSR_Function SHALL respond to GET requests at `/categoria/{slug}` with a full HTML document.
2. THE Category_Page HTML SHALL include a `<title>` tag with the format `{category.name} — Canopia Grow Shop`.
3. THE Category_Page HTML SHALL include `<meta name="description">` using the category's `description` field (truncated to 160 characters).
4. THE Category_Page HTML SHALL include `<link rel="canonical" href="https://canopiagrow.com/categoria/{slug}">`.
5. THE Category_Page HTML SHALL include complete Open Graph tags: `og:title`, `og:description`, `og:url`, `og:type` (set to `website`).
6. THE Category_Page HTML SHALL include a JSON-LD `ItemList` schema listing up to 10 visible products of that category, each with `name`, `url`, and `image`.
7. THE Category_Page HTML SHALL include a JSON-LD `BreadcrumbList` schema with two items: home and the category page.
8. THE Category_Page HTML SHALL list all visible products of the category in an HTML product grid, each with product `name`, `price`, and `image`.
9. THE Category_Page HTML SHALL embed the full SPA so the user can continue browsing after the SSR page loads.
10. WHEN a category slug does not match any category in D1 (after slugification), THE SSR_Function SHALL return an HTTP 404 response with a clean HTML error page.
11. THE SSR_Function SHALL sanitize ALL category and product data inserted into HTML output using `escapeHtml` to prevent XSS.
12. THE Category_Page HTML SHALL include a visible "← Volver a la tienda" link pointing to `https://canopiagrow.com/#catalogo`.

### Requerimiento 8: Biblioteca de Utilidades SEO Compartidas

**User Story:** Como desarrollador, quiero un módulo de utilidades SEO reutilizables, para que las SSR Functions y el sitemap compartan lógica común sin duplicación de código.

#### Criterios de Aceptación

1. THE SEO_Lib SHALL export a function `escapeHtml(str)` that replaces `&`, `<`, `>`, `"`, and `'` with their HTML entities.
2. THE SEO_Lib SHALL export a function `slugify(str)` that converts a string to lowercase, removes diacritics, replaces non-alphanumeric sequences with hyphens, and trims leading/trailing hyphens.
3. THE SEO_Lib SHALL export a function `truncate(str, maxLen)` that returns the string truncated to `maxLen` characters, appending `…` if truncation occurs.
4. THE SEO_Lib SHALL export a function `buildProductHtml(product, spaHtml)` that returns the full HTML string for a product SSR page.
5. THE SEO_Lib SHALL export a function `buildCategoryHtml(category, products, spaHtml)` that returns the full HTML string for a category SSR page.
6. THE SEO_Lib SHALL export a constant `SITE_BASE_URL` with value `https://canopiagrow.com`.
7. WHEN `escapeHtml` receives a non-string input, THE SEO_Lib SHALL coerce it to string before escaping.
8. FOR ALL strings passed to `escapeHtml`, THE SEO_Lib SHALL ensure the output contains no unescaped `<`, `>`, `&`, `"`, or `'` characters.

### Requerimiento 9: Compatibilidad con CSP Existente

**User Story:** Como administrador de seguridad, quiero que las páginas SSR respeten la Content Security Policy existente, para que no se introduzcan vulnerabilidades al agregar nuevos endpoints.

#### Criterios de Aceptación

1. THE SSR_Function pages SHALL use inline `<script type="application/ld+json">` only for JSON-LD data, which is permitted by the existing CSP (`script-src 'self' https://challenges.cloudflare.com` — nota: JSON-LD no ejecuta código).
2. THE SSR_Function pages SHALL NOT introduce `eval()`, `Function()`, or other dynamic code execution patterns.
3. THE SSR_Function pages SHALL serve responses with a `Content-Type: text/html; charset=UTF-8` header.
4. THE SSR_Function pages SHALL NOT include inline `<style>` blocks with arbitrary CSS that contradicts the existing `_headers` CSP.

### Requerimiento 10: Comportamiento Ante Errores en SSR Functions

**User Story:** Como visitante del sitio, quiero recibir páginas de error claras cuando una URL de producto o categoría no existe, para que pueda navegar de vuelta a la tienda fácilmente.

#### Criterios de Aceptación

1. WHEN a Product_Page SSR_Function encounters a D1 query error, THE SSR_Function SHALL return an HTTP 500 response with an HTML error page that includes a link back to the home page.
2. WHEN a Category_Page SSR_Function encounters a D1 query error, THE SSR_Function SHALL return an HTTP 500 response with an HTML error page that includes a link back to the home page.
3. THE 404 HTML error pages SHALL include a `<title>` tag with "Página no encontrada — Canopia".
4. THE 500 HTML error pages SHALL include a `<title>` tag with "Error del servidor — Canopia".
5. THE error pages SHALL include a visible link with text "Volver a la tienda" pointing to `https://canopiagrow.com/`.
