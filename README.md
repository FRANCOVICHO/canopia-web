# Canopia Smoke & Grow Shop

Web estatica para catalogo de parafernalia, grow shop, smoke shop y combos.

## Abrir local

Usar `ABRIR_CANOPIA.bat`. El archivo abre el navegador y levanta un servidor local
en `http://127.0.0.1:4173/index.html`.

## Gestionar catalogo (recomendado)

Usar `EDITAR_CANOPIA.bat` o entrar a `/admin.html` en la web publicada.

El panel admin permite:

- Crear, editar y borrar productos
- Cambiar precios y stock con botones +/-
- Marcar destacados y ocultar productos
- Ver cambios reflejados en la tienda en unos segundos (sync automatico gratis)

### Configurar admin en Cloudflare (una sola vez)

1. Entra a tu proyecto en Cloudflare Pages.
2. Settings > Environment variables.
3. Agrega una variable:
   - Name: `ADMIN_TOKEN`
   - Value: una clave secreta que solo vos conozcas (ejemplo: `canopia2026-secreto`)
4. Guarda y vuelve a desplegar el sitio.
5. Entra a `https://tu-dominio.pages.dev/admin.html` y usa esa clave.

La base D1 gratuita ya esta configurada en `wrangler.toml`. Si es un deploy nuevo,
ejecuta el schema y seed:

```bash
npx wrangler d1 execute canopia-db --remote --file=schema.sql
npx wrangler d1 execute canopia-db --remote --file=seed.sql
```

## Editar tema y contacto

Los colores, WhatsApp, Instagram, categorias y combos siguen en `data/site.json`.
Podes editarlo a mano o con el archivo `editor.js` / `EDITAR_WEB.html` (redirige al admin).

## Hosting gratuito 24/7

Cloudflare Pages + D1 free tier:

- Sitio estatico ilimitado
- Base de datos D1 gratis (hasta 5 GB)
- Functions para API de productos y pedidos
- Sin costo mensual para este tamano de tienda

Pasos:

1. Crear una cuenta gratis en Cloudflare.
2. Entrar a Workers & Pages.
3. Crear un proyecto de Pages conectado a GitHub (`FRANCOVICHO/canopia-web`).
4. Framework preset: None.
5. Build command: vacio.
6. Output directory: `/` o vacio.
7. Agregar `ADMIN_TOKEN` como variable de entorno.
