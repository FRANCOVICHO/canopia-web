# Canopia Smoke & Grow Shop

Web estatica para catalogo de parafernalia, grow shop, smoke shop y combos.

## Abrir local

Usar `ABRIR_CANOPIA.bat`. El archivo abre el navegador y levanta un servidor local
en `http://127.0.0.1:4173/index.html`.

## Editar contenido

Usar `EDITAR_CANOPIA.bat`, modificar los datos y descargar `site.json`. Despues
reemplazar `data/site.json` por el archivo descargado.

Para editar productos online desde Google Sheets, leer `COMO_EDITAR_ONLINE.txt`.

Datos principales:

- `theme`: colores del sitio.
- `contact`: WhatsApp, Instagram y texto de contacto.
- `categories`: categorias del catalogo.
- `products`: productos, precios y destacados.
- `combos`: promociones.

## Hosting gratuito 24/7 recomendado

Cloudflare Pages es la opcion recomendada para esta web estatica porque su plan Free
incluye sitios ilimitados, requests estaticos ilimitados y ancho de banda ilimitado.

Pasos:

1. Crear una cuenta gratis en Cloudflare.
2. Entrar a Workers & Pages.
3. Crear un proyecto de Pages.
4. Subir esta carpeta o conectarla con GitHub.
5. Framework preset: None.
6. Build command: dejar vacio.
7. Output directory: `/` o dejar vacio si se sube directo.
