# Implementation Plan: SEO Improvements — Canopia Grow Shop

## Overview

Implement SEO improvements in two complementary layers:
1. **Global layer**: Enrich `index.html` `<head>` with metadata, favicons, JSON-LD, canonical tag, and preloads. Create static `robots.txt`.
2. **SSR layer**: Cloudflare Functions that query D1 and return full HTML with SEO metadata for `/producto/{id}` and `/categoria/{slug}`. A shared utility library (`functions/_lib/seo.js`) powers all SSR functions and the dynamic sitemap.

All changes must preserve the existing SPA functionality without modifying `app.js`.

---

## Tasks

- [x] 1. Create the shared SEO utility library
  - [x] 1.1 Implement `functions/_lib/seo.js` with core utility functions
    - Export `SITE_BASE_URL = "https://canopiagrow.com"`
    - Implement `escapeHtml(str)`: replaces `&`, `<`, `>`, `"`, `'` with HTML entities; coerces non-string input to string before escaping
    - Implement `slugify(str)`: lowercase, remove diacritics (NFD normalize + strip combining marks), replace non-alphanumeric sequences with hyphens, trim leading/trailing hyphens
    - Implement `truncate(str, maxLen)`: returns string truncated to `maxLen` chars, appending `…` if truncation occurs
    - _Requirements: 8.1, 8.2, 8.3, 8.6, 8.7, 8.8_

  - [x] 1.2 Write property test for `escapeHtml`
    - **Property 1: escapeHtml eliminates all dangerous HTML characters**
    - For any input string, `escapeHtml(s)` must not contain unescaped `<`, `>`, `"`, or `'`
    - Use `fast-check` + `vitest`; minimum 100 iterations
    - **Validates: Requirements 8.1, 8.8**

  - [x] 1.3 Write property test for `slugify`
    - **Property 2: slugify produces only URL-safe characters**
    - For any input string, `slugify(s)` must match `^[a-z0-9-]*$` and must not start or end with a hyphen
    - **Validates: Requirements 8.2**

  - [x] 1.4 Write property test for `truncate`
    - **Property 3: truncate never exceeds maxLen**
    - For any string and any `maxLen > 0`, `truncate(s, maxLen).length <= maxLen`
    - **Validates: Requirements 8.3**

- [ ] 2. Implement `buildProductHtml` and `buildCategoryHtml` in `seo.js`
  - [x] 2.1 Implement `buildProductHtml(product, spaHtml)`
    - Generate full HTML string for a product SSR page
    - `<title>`: `{product.name} — Canopia Grow Shop`
    - `<meta name="description">`: product description truncated to 160 chars
    - `<link rel="canonical">`: `https://canopiagrow.com/producto/{product.id}`
    - Full Open Graph tags: `og:title`, `og:description`, `og:url`, `og:image`, `og:type` (`product`), `og:price:amount`
    - Twitter Card tags: `twitter:card` (`summary_large_image`), `twitter:title`, `twitter:description`, `twitter:image`
    - JSON-LD `Product` schema: name, description, image, price, currency (`ARS`), availability, URL
    - JSON-LD `BreadcrumbList` schema: home (`/`) + product page (`/producto/{id}`)
    - Visible "← Volver a la tienda" link to `https://canopiagrow.com/#catalogo`
    - Embed `spaHtml` at the end of the body
    - Apply `escapeHtml` to ALL product data fields inserted into HTML
    - `Content-Type: text/html; charset=UTF-8` header
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.12, 6.13, 9.3_

  - [-] 2.2 Write property test for `buildProductHtml`
    - **Property 4: buildProductHtml contains correct escaped fields**
    - For any valid product (including those with HTML special characters in any field), the output must: (a) contain `escapeHtml(product.name)` in `<title>`, (b) contain the canonical URL with `product.id`, (c) contain `"@type": "Product"` JSON-LD with name, description, and price, (d) contain no unescaped `<`, `>`, `"`, or `'` in any product data field
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.7, 6.12**

  - [x] 2.3 Implement `buildCategoryHtml(category, products, spaHtml)`
    - Generate full HTML string for a category SSR page
    - `<title>`: `{category.name} — Canopia Grow Shop`
    - `<meta name="description">`: category description truncated to 160 chars
    - `<link rel="canonical">`: `https://canopiagrow.com/categoria/{slugify(category.name)}`
    - Open Graph tags: `og:title`, `og:description`, `og:url`, `og:type` (`website`)
    - JSON-LD `ItemList` schema: up to 10 products, each with `name`, `url`, `image`
    - JSON-LD `BreadcrumbList` schema: home + category page
    - HTML product grid listing all visible products with `name`, `price`, and `image`; use descriptive `alt` text with category name for images
    - Visible "← Volver a la tienda" link to `https://canopiagrow.com/#catalogo`
    - Embed `spaHtml` at the end of the body
    - Apply `escapeHtml` to ALL category and product data inserted into HTML
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.11, 7.12, 3.3_

  - [-] 2.4 Write property test for `buildCategoryHtml`
    - **Property 5: buildCategoryHtml contains all products and metadata**
    - For any valid category and list of `n >= 0` products, the output must: (a) contain `escapeHtml(category.name)` in `<title>`, (b) contain the canonical URL with the category slug, (c) include the name of each of the `n` products, (d) contain no unescaped user data
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.8, 7.11**

- [ ] 3. Implement `buildSitemapXml` and `buildErrorHtml` in `seo.js`
  - [x] 3.1 Implement `buildSitemapXml(products, categories)`
    - Generate a valid XML sitemap string
    - Include home URL with `changefreq=weekly` and `priority=1.0`
    - Include one `<url>` per product: path `/producto/{product.id}`, `<lastmod>` from `product.updated_at` in ISO 8601
    - Include one `<url>` per category: path `/categoria/{slugify(category.name)}`
    - Do NOT include `/admin`, `/api/*`, authentication, or cart URLs
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [-] 3.2 Write property test for `buildSitemapXml`
    - **Property 6: buildSitemapXml generates correct URL count**
    - For any list of `n` products and `m` categories, the output must contain exactly `n + m + 1` `<url>` elements
    - **Validates: Requirements 5.2, 5.3, 5.4**

  - [x] 3.3 Implement `buildErrorHtml(statusCode, title, message)`
    - Return minimal, accessible HTML error page
    - `<title>`: `{title} — Canopia`
    - Include visible "Volver a la tienda" link to `https://canopiagrow.com/`
    - Include inline minimal CSS (permitted by existing CSP `style-src 'self' 'unsafe-inline'`)
    - _Requirements: 10.3, 10.4, 10.5_

- [ ] 4. Checkpoint — Ensure all `seo.js` tests pass
  - Run the Vitest test suite for `functions/_lib/seo.js`
  - Ensure all property tests and unit tests pass, ask the user if questions arise.

- [x] 5. Implement the SSR Cloudflare Function for product pages
  - [x] 5.1 Create `functions/producto/[id].js`
    - Export `onRequestGet({ request, env, params })`
    - Query D1: `SELECT id, name, category, description, price, tag, image, visible, updated_at FROM products WHERE id = ? LIMIT 1`
    - If product not found → return 404 using `buildErrorHtml(404, "Página no encontrada", "...")`
    - If `visible=0` → return 301 redirect to `https://canopiagrow.com/`
    - Fetch SPA HTML using `env.ASSETS.fetch(new Request("https://placeholder/index.html"))` and read as text
    - Call `buildProductHtml(product, spaHtml)` and return 200 response with `Content-Type: text/html; charset=UTF-8`
    - On D1 error → return 500 using `buildErrorHtml(500, "Error del servidor", "...")`
    - Do NOT use `eval()`, `Function()`, or dynamic code execution
    - _Requirements: 6.1, 6.9, 6.10, 6.11, 6.12, 9.1, 9.2, 9.3, 9.4, 10.1, 10.3, 10.4, 10.5_

- [x] 6. Implement the SSR Cloudflare Function for category pages
  - [x] 6.1 Create `functions/categoria/[id].js`
    - Export `onRequestGet({ request, env, params })`
    - Fetch all categories from D1, find matching category using `slugify(c.name) === slugify(params.id)`
    - If no match → return 404 using `buildErrorHtml(404, "Página no encontrada", "...")`
    - Query D1 for visible products: `SELECT id, name, description, price, image, tag FROM products WHERE category = ? AND visible = 1 ORDER BY featured DESC, name ASC LIMIT 50`
    - Fetch SPA HTML using `env.ASSETS.fetch(new Request("https://placeholder/index.html"))` and read as text
    - Call `buildCategoryHtml(category, products, spaHtml)` and return 200 with `Content-Type: text/html; charset=UTF-8`
    - On D1 error → return 500 using `buildErrorHtml(500, "Error del servidor", "...")`
    - _Requirements: 7.1, 7.9, 7.10, 7.11, 9.1, 9.2, 9.3, 9.4, 10.2, 10.3, 10.4, 10.5_

- [x] 7. Implement the dynamic sitemap Cloudflare Function
  - [x] 7.1 Create `functions/sitemap.xml.js`
    - Export `onRequestGet({ env })`
    - Query D1 for products: `SELECT id, updated_at FROM products WHERE visible = 1 ORDER BY name ASC`
    - Query D1 for categories: `SELECT name FROM categories ORDER BY sort_order ASC, name ASC`
    - Call `buildSitemapXml(products, categories)` and return 200 with `Content-Type: application/xml`
    - On D1 error → return 500 with XML error body
    - _Requirements: 5.1, 5.7, 5.8_

- [x] 8. Create the static `robots.txt` file
  - [x] 8.1 Create `robots.txt` at the project root
    - `User-agent: *`
    - Allow: `/`, `/producto/`, `/categoria/`, `/assets/`
    - Disallow: `/admin`, `/api/`, `/_headers`
    - Include `Sitemap: https://canopiagrow.com/sitemap.xml`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 9. Enrich `index.html` `<head>` with global SEO metadata
  - [-] 9.1 Add favicon and touch icon tags to `index.html`
    - Add `<link rel="icon" type="image/png" sizes="32x32" href="/assets/logo-icon.png">`
    - Add `<link rel="icon" type="image/png" sizes="16x16" href="/assets/logo-icon.png">`
    - Add `<link rel="apple-touch-icon" sizes="180x180" href="/assets/logo-icon.png">`
    - Add `<link rel="shortcut icon" href="/assets/logo-icon.png">`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 9.2 Add canonical, theme-color, preload, Open Graph, and Twitter Card tags to `index.html`
    - Add `<link rel="canonical" href="https://canopiagrow.com/">`
    - Add `<meta name="theme-color" content="#0d0f10">`
    - Add `<link rel="preload" as="image" href="/assets/hero.png">`
    - Add all 5 `og:*` meta tags (`og:type`, `og:url`, `og:title`, `og:description`, `og:image`)
    - Add all 4 `twitter:*` meta tags (`twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`)
    - Do NOT modify any existing JavaScript logic, visual layout, or inline styles
    - Verify `<html lang="es">` is still present
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.8, 1.9_

  - [x] 9.3 Add JSON-LD blocks for `WebSite` and `Organization` schemas to `index.html`
    - Add `<script type="application/ld+json">` with `WebSite` schema including `SearchAction`
    - Add `<script type="application/ld+json">` with `Organization` schema including name, URL, logo, Instagram sameAs, and contactPoint
    - _Requirements: 1.6, 1.7_

  - [x] 9.4 Add `width` and `height` attributes to image tags in `index.html`
    - Add explicit `width` and `height` to the `<img>` tag for `assets/hero.png`
    - Add explicit `width` and `height` to all `<img>` tags for `assets/logo-icon.png` (header brand and footer)
    - Do NOT modify `app.js`
    - _Requirements: 3.1, 3.2, 3.4_

- [~] 10. Final checkpoint — Ensure all tests pass
  - Run the full Vitest test suite
  - Smoke-check: verify `robots.txt` contains `Disallow: /admin`, `index.html` contains `og:title` and `rel="canonical"`, and error pages return the correct HTTP status codes
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints (tasks 4 and 10) ensure incremental validation
- Property tests use `fast-check` + `vitest`; minimum 100 iterations per property
- Unit tests validate specific examples and edge cases
- The `env.ASSETS` binding is the recommended approach for fetching `index.html` in Cloudflare Pages Functions
- The SSR strategy prepends SEO HTML + embedded JSON data, then appends the full `index.html` — no parsing of `index.html` at request time
- `app.js` must NOT be modified under any circumstance (Requirements 3.4)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "8.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "2.1", "2.3", "3.1", "3.3"] },
    { "id": 2, "tasks": ["2.2", "2.4", "3.2", "9.1", "9.2", "9.3", "9.4"] },
    { "id": 3, "tasks": ["5.1", "6.1", "7.1"] }
  ]
}
```
