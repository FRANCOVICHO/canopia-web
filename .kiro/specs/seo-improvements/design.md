# Diseño Técnico: Mejoras SEO — Canopia Grow Shop

## Overview

Las mejoras SEO se implementan en dos capas complementarias que no alteran la SPA existente:

1. **Capa global (Opción C)**: Enriquecimiento del `<head>` de `index.html` con metadatos, favicons, JSON-LD, canonical y preloads. Archivos estáticos `robots.txt`.
2. **Capa SSR (Opción B)**: Cloudflare Functions que consultan D1 y devuelven HTML completo con todos los metadatos SEO para `/producto/{id}` y `/categoria/{slug}`. La Function también embebe la SPA completa para mantener la experiencia interactiva.

El enfoque central es que los motores de búsqueda (que no ejecutan JavaScript) vean el contenido completo al rastrear estas URLs, mientras los usuarios continúan usando la SPA normalmente.

---

## Architecture

```
canopiagrow.com
│
├── / (index.html estático — SPA)
│     └── <head> enriquecido: canonical, OG, Twitter, JSON-LD, favicons, preload
│
├── /robots.txt (estático)
├── /sitemap.xml → functions/sitemap.xml.js (consulta D1)
│
├── /producto/{id} → functions/producto/[id].js (SSR desde D1)
│     └── HTML completo: title, metas SEO, JSON-LD Product + Breadcrumb + SPA embebida
│
├── /categoria/{slug} → functions/categoria/[id].js (SSR desde D1)
│     └── HTML completo: title, metas SEO, JSON-LD ItemList + Breadcrumb + SPA embebida
│
└── functions/_lib/seo.js (utilidades compartidas)
```

### Flujo de Request para Página de Producto

```
Crawler/Navegador
  → GET /producto/kit-inicio-grow
  → Cloudflare Pages Router → functions/producto/[id].js
      → D1: SELECT * FROM products WHERE id = 'kit-inicio-grow'
      → Producto encontrado + visible=1:
          → buildProductHtml(product, spaHtml) → HTML completo
          → Response 200, Content-Type: text/html
      → Producto no encontrado:
          → Response 404, HTML de error
      → visible=0:
          → Response 301, Location: https://canopiagrow.com/
```

### Flujo de Request para Sitemap

```
Crawler
  → GET /sitemap.xml
  → functions/sitemap.xml.js
      → D1: SELECT id, updated_at FROM products WHERE visible=1
      → D1: SELECT name FROM categories
      → buildSitemapXml(products, categories)
      → Response 200, Content-Type: application/xml
```

---

## Components and Interfaces

### 1. `functions/_lib/seo.js` — Módulo de Utilidades

Este módulo exporta todas las utilidades compartidas entre las SSR Functions.

```javascript
// Constante global
export const SITE_BASE_URL = "https://canopiagrow.com";

// Sanitización XSS
export function escapeHtml(str) { ... }

// Utilidades de string
export function slugify(str) { ... }
export function truncate(str, maxLen) { ... }

// Constructores de HTML
export function buildProductHtml(product, spaHtml) { ... }
export function buildCategoryHtml(category, products, spaHtml) { ... }
export function buildErrorHtml(statusCode, title, message) { ... }

// Constructor de Sitemap
export function buildSitemapXml(products, categories) { ... }
```

**Interfaz `product` esperada por `buildProductHtml`:**
```javascript
{
  id: string,           // slug, ej: "kit-inicio-grow"
  name: string,
  category: string,
  description: string,
  price: number,        // en centavos ARS o unidades enteras
  tag: string,
  image: string,        // URL de la imagen principal
  visible: number,      // 1 | 0
  updated_at: string
}
```

**Interfaz `category` esperada por `buildCategoryHtml`:**
```javascript
{
  name: string,         // nombre original, ej: "Parafernalia"
  description: string,
  sort_order: number
}
```

### 2. `functions/producto/[id].js` — SSR de Producto

```javascript
// Exporta el handler GET estándar de Cloudflare Pages Functions
export async function onRequestGet({ request, env, params }) {
  const id = params.id;
  // 1. Consultar D1
  // 2. Validar visible
  // 3. Leer SPA HTML (fetch interno o string hardcodeado)
  // 4. Construir y devolver HTML
}
```

**Estrategia para embeber la SPA**: La función hace un `fetch` interno a `https://canopiagrow.com/` (la propia SPA) usando el mismo request origin, o se usa `env.ASSETS.fetch(new Request("https://placeholder/index.html"))` si el binding `ASSETS` está disponible (recomendado para Cloudflare Pages Functions). Esto evita hardcodear el HTML de la SPA en la Function.

> **Nota de implementación**: En Cloudflare Pages Functions, el binding `env.ASSETS` permite acceder a los assets estáticos directamente. La función debe usar `env.ASSETS.fetch(request)` para obtener el `index.html` como string y luego inyectar los tags SEO antes del `</head>`.

**Alternativa práctica**: Pre-pender el HTML SEO + un `<div id="ssr-product-data">` con los datos embebidos como JSON, seguido del `index.html` completo. De esta forma, no es necesario parsear ni modificar el `index.html` en tiempo de request; simplemente se concatenan ambos bloques.

### 3. `functions/categoria/[id].js` — SSR de Categoría

Mismo patrón que el de producto, pero:
- El parámetro de URL es el slug de la categoría.
- Consulta tanto la tabla `categories` como `products WHERE category = ? AND visible = 1`.
- La función `slugify` se aplica al parámetro de URL y a cada `name` de categoría para matching.

### 4. `functions/sitemap.xml.js` — Sitemap Dinámico

```javascript
export async function onRequestGet({ env }) {
  // Consultar D1
  // Construir XML
  // Devolver Response con Content-Type: application/xml
}
```

### 5. `index.html` — Modificaciones al `<head>`

Se agregan los siguientes bloques al `<head>` existente, después de las etiquetas de viewport y description actuales:

```html
<!-- Favicon & Touch Icons -->
<link rel="icon" type="image/png" sizes="32x32" href="/assets/logo-icon.png">
<link rel="icon" type="image/png" sizes="16x16" href="/assets/logo-icon.png">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/logo-icon.png">
<link rel="shortcut icon" href="/assets/logo-icon.png">

<!-- Canonical -->
<link rel="canonical" href="https://canopiagrow.com/">

<!-- Theme color -->
<meta name="theme-color" content="#0d0f10">

<!-- Preload hero -->
<link rel="preload" as="image" href="/assets/hero.png">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:url" content="https://canopiagrow.com/">
<meta property="og:title" content="Canopia Smoke & Grow Shop">
<meta property="og:description" content="Parafernalia, cultivo indoor, accesorios y combos. Todo lo que necesitás para tu espacio grow y tu ritual smoke.">
<meta property="og:image" content="https://canopiagrow.com/assets/hero.png">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Canopia Smoke & Grow Shop">
<meta name="twitter:description" content="Parafernalia, cultivo indoor, accesorios y combos.">
<meta name="twitter:image" content="https://canopiagrow.com/assets/hero.png">

<!-- JSON-LD WebSite -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Canopia Grow Shop",
  "url": "https://canopiagrow.com/",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://canopiagrow.com/#catalogo?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
</script>

<!-- JSON-LD Organization -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Canopia Grow Shop",
  "url": "https://canopiagrow.com/",
  "logo": "https://canopiagrow.com/assets/logo-canopia.png",
  "sameAs": ["https://www.instagram.com/canopiagrow/"],
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer service",
    "availableLanguage": "Spanish"
  }
}
</script>
```

---

## Data Models

### Consultas D1 utilizadas

**Página de Producto:**
```sql
SELECT id, name, category, description, price, tag, image, visible, updated_at
FROM products
WHERE id = ?
LIMIT 1;
```

**Página de Categoría:**
```sql
-- Categoría
SELECT name, description, sort_order
FROM categories
WHERE name = ?    -- matching por nombre slugificado
LIMIT 1;

-- Productos de la categoría
SELECT id, name, description, price, image, tag
FROM products
WHERE category = ? AND visible = 1
ORDER BY featured DESC, name ASC
LIMIT 50;
```

**Sitemap — Productos:**
```sql
SELECT id, updated_at
FROM products
WHERE visible = 1
ORDER BY name ASC;
```

**Sitemap — Categorías:**
```sql
SELECT name
FROM categories
ORDER BY sort_order ASC, name ASC;
```

### Matching de Categorías por Slug

La tabla `categories` usa el campo `name` como PRIMARY KEY (texto libre, ej: `"Parafernalia"`, `"grow"`). Las URLs de categoría usan slugs (`/categoria/parafernalia`). El matching se resuelve así:

```javascript
// En la Function, al recibir el parámetro "parafernalia":
const { results } = await env.canopia_db
  .prepare("SELECT name, description FROM categories")
  .all();

const category = results.find(c => slugify(c.name) === slugify(params.id));
```

Esto es robusto ante variaciones de mayúsculas y acentos en los nombres de categoría.

---

## Correctness Properties

*Una propiedad es una característica o comportamiento que debe cumplirse en todas las ejecuciones válidas del sistema — esencialmente, una declaración formal sobre lo que el sistema debe hacer. Las propiedades sirven como puente entre las especificaciones legibles por humanos y las garantías de corrección verificables por máquina.*

### Property 1: escapeHtml elimina todos los caracteres HTML peligrosos

*Para cualquier* string de entrada (incluyendo strings con `<script>`, atributos `onclick`, comillas simples, comillas dobles y ampersands), el resultado de `escapeHtml(input)` no debe contener los caracteres `<`, `>`, `"`, ni `'` literales sin escapar.

**Validates: Requirements 8.1, 8.8, 6.12, 7.11**

### Property 2: slugify produce únicamente caracteres URL-safe

*Para cualquier* string de entrada que represente un nombre de categoría o producto (con letras, números, espacios, acentos, mayúsculas o caracteres especiales), `slugify(input)` debe retornar únicamente caracteres `[a-z0-9-]` y no debe comenzar ni terminar con un guion.

**Validates: Requirements 8.2**

### Property 3: truncate nunca produce una cadena más larga que maxLen

*Para cualquier* string de entrada y cualquier entero `maxLen > 0`, la longitud del resultado de `truncate(str, maxLen)` es siempre menor o igual a `maxLen`.

**Validates: Requirements 8.3**

### Property 4: buildProductHtml contiene campos correctos y datos escapados

*Para cualquier* producto válido con campos `id`, `name`, `description`, `price`, e `image` (incluidos aquellos con caracteres especiales HTML en cualquier campo), la salida de `buildProductHtml(product, "")` debe: (a) contener el nombre del producto escapado dentro del `<title>`, (b) contener la URL canónica con el `id` del producto, (c) contener el marcador JSON-LD `"@type": "Product"` con los campos `name`, `description` y `price`, y (d) no contener los caracteres `<`, `>`, `"` ni `'` sin escapar en ningún campo de datos del producto.

**Validates: Requirements 6.2, 6.3, 6.4, 6.7, 6.12**

### Property 5: buildCategoryHtml contiene metadatos SEO y todos los productos de la categoría

*Para cualquier* categoría válida y lista de `n` productos (con `n >= 0`, incluyendo listas vacías), la salida de `buildCategoryHtml(category, products, "")` debe: (a) contener el nombre de la categoría escapado en el `<title>`, (b) contener la URL canónica con el slug de la categoría, (c) incluir el nombre de cada uno de los `n` productos en el contenido HTML, y (d) no contener datos de usuario sin escapar.

**Validates: Requirements 7.2, 7.3, 7.4, 7.8, 7.11**

### Property 6: buildSitemapXml genera el número correcto de entradas URL

*Para cualquier* lista de `n` productos visibles y `m` categorías, la salida de `buildSitemapXml(products, categories)` debe contener exactamente `n + m + 1` elementos `<url>` (un elemento por cada producto, uno por cada categoría, más uno para la home).

**Validates: Requirements 5.2, 5.3, 5.4**

---

## Error Handling

### SSR Functions — Tabla de Respuestas

| Condición | HTTP Status | Respuesta |
|---|---|---|
| Producto encontrado, visible=1 | 200 | HTML completo SSR |
| Producto no encontrado | 404 | HTML error "Página no encontrada" |
| Producto visible=0 | 301 | Redirect a `https://canopiagrow.com/` |
| Error en D1 | 500 | HTML error "Error del servidor" |
| Categoría no encontrada | 404 | HTML error "Página no encontrada" |
| Error en D1 (categoría) | 500 | HTML error "Error del servidor" |

### Sitemap — Tabla de Respuestas

| Condición | HTTP Status | Respuesta |
|---|---|---|
| D1 responde OK | 200 | XML sitemap válido |
| Error en D1 | 500 | XML con mensaje de error |

### Estructura de páginas de error

Las páginas 404 y 500 son HTML mínimo y accesible:

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>{titulo} — Canopia</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>/* estilos inline mínimos para mostrar error sin depender de styles.css */</style>
</head>
<body>
  <main>
    <h1>{titulo}</h1>
    <p>{mensaje}</p>
    <a href="https://canopiagrow.com/">← Volver a la tienda</a>
  </main>
</body>
</html>
```

Los estilos inline en las páginas de error son permitidos porque no dependen de archivos externos, y la CSP actual ya incluye `style-src 'self' 'unsafe-inline'`.

---

## Testing Strategy

Este feature involucra principalmente funciones puras de transformación de strings y constructores de HTML/XML — lo que lo hace **apto para property-based testing** en la capa de utilidades (`seo.js`), complementado con tests de integración para las Cloudflare Functions.

### Tests Unitarios y de Propiedades — `functions/_lib/seo.js`

**Framework recomendado**: [fast-check](https://fast-check.io/) para JavaScript (property-based), con [Vitest](https://vitest.dev/) como runner.

Configuración: mínimo 100 iteraciones por propiedad.

**Tests de propiedad a implementar:**

```
Property 1 — Idempotencia de escapeHtml:
  fc.property(fc.string(), s => escapeHtml(escapeHtml(s)) === escapeHtml(s) NO
  // Nota: la idempotencia estricta no aplica (& → &amp; → &amp;amp;).
  // La propiedad correcta es: ningún carácter peligroso sobrevive un pase.
  fc.property(fc.string(), s => !/[<>"']/.test(escapeHtml(s)))

Property 2 — Sin caracteres peligrosos post-escape:
  fc.property(fc.string(), s => !/[<>"'&(?!amp;)(?!lt;)(?!gt;)(?!quot;)(?!#39;)]/.test(escapeHtml(s)))

Property 3 — slugify URL-safe:
  fc.property(fc.string(), s => /^[a-z0-9-]*$/.test(slugify(s)))

Property 4 — truncate nunca supera maxLen:
  fc.property(fc.string(), fc.integer({min:1, max:500}), (s, n) => truncate(s, n).length <= n)

Property 5 — buildProductHtml contiene campos del producto:
  fc.property(arbitraryProduct(), p => {
    const html = buildProductHtml(p, "");
    return html.includes(escapeHtml(p.name)) && html.includes(p.id) && html.includes('"Product"');
  })

Property 6 — buildCategoryHtml incluye todos los productos:
  fc.property(arbitraryCategory(), fc.array(arbitraryProduct()), (cat, prods) => {
    const html = buildCategoryHtml(cat, prods, "");
    return prods.every(p => html.includes(escapeHtml(p.name)));
  })

Property 7 — buildSitemapXml cuenta correcto de URLs:
  fc.property(fc.array(arbitraryProduct()), fc.array(arbitraryCategory()), (prods, cats) => {
    const xml = buildSitemapXml(prods, cats);
    const count = (xml.match(/<url>/g) || []).length;
    return count === prods.length + cats.length + 1; // +1 home
  })
```

### Tests de Integración — Cloudflare Functions

Para las Functions SSR, dado que requieren el binding `env.canopia_db` y `env.ASSETS`, se usan **mocks del entorno D1** con [Miniflare](https://miniflare.dev/) o el wrangler local (`wrangler pages dev`):

- Test 1: GET `/producto/kit-inicio-grow` con D1 mock → Response 200, HTML contiene `kit-inicio-grow`.
- Test 2: GET `/producto/no-existe` con D1 mock vacío → Response 404.
- Test 3: GET `/producto/producto-oculto` (visible=0) → Response 301.
- Test 4: GET `/categoria/parafernalia` → Response 200, HTML contiene productos de esa categoría.
- Test 5: GET `/categoria/no-existe` → Response 404.
- Test 6: GET `/sitemap.xml` → Response 200, XML válido con `<urlset>`.

### Tests de Humo (Smoke Tests)

- Verificar que `robots.txt` existe y contiene `Disallow: /admin`.
- Verificar que `index.html` contiene `og:title` y `rel="canonical"`.
- Verificar que las páginas de error devuelven el status code correcto.
