# Entrada y privacidad de Canopia

La entrada de marca dura como mínimo cuatro segundos, utiliza el logo original sin su fondo de papel y representa un cigarrillo ilustrado que se consume hasta dejar el filtro. Si la preparación tarda más, la combustión se prolonga. Se muestra una vez por sesión de pestaña; la lectura de sessionStorage ocurre antes de pintar el cuerpo para evitar repetirla al recargar.

Las rutas de producto y categoría conservan el CSS crítico desde su primer head y resuelven los recursos respecto de la raíz. El contenido SSR no se expone durante la entrada; se revela al terminar, con recuperación sin JavaScript. La exclusión de productos pendientes de clasificación se aplica también a estas rutas y al sitemap dinámico.

El consentimiento controla analítica e historial de búsquedas. Las preferencias pueden rechazarse, personalizarse y revocarse; los mecanismos necesarios para las funciones solicitadas se mantienen disponibles. Las políticas de privacidad y cookies, términos, información de edad y canal de arrepentimiento están enlazados desde la tienda.

## Pendientes de publicación definitiva

Los documentos legales conservan su identificación de borrador y sus marcadores pendientes. Faltan datos fiscales y domicilio del responsable, validación de proveedores y conservación, clasificación de cada SKU y validación operativa del proceso de arrepentimiento. El enlace de WhatsApp requiere que el visitante envíe el mensaje: no registra automáticamente una solicitud ni emite constancias. Publicar el código no equivale a certificar cumplimiento legal.

No se habilitan productos sujetos a verificación de edad ni se utiliza una autodeclaración como autorización. La clasificación por nombres y categorías es preventiva y necesita revisión por producto.

## Validación

Se ejecutaron 25 pruebas Node sobre seguridad, pedidos, repartidores, privacidad y rutas SSR; las 25 pasaron. La revisión anterior de interfaz cubrió 23 comprobaciones de navegador con respuestas de prueba. Se agregó una comprobación de navegador de las rutas SSR para validar carga de recursos, entrada inicial y salto por sesión. No se hicieron pedidos ni accesos con credenciales reales de producción.

Las Functions se compilaron con Wrangler 4.107.0. El test de rutas incluido se ejecuta con:

```sh
node --test tests/ssr-entry.test.mjs
```

Para repetir la entrada solo en desarrollo local: `http://127.0.0.1:4180/?preview-entry=1`. Este parámetro no omite la regla de sesión en el dominio público.
