INSERT OR REPLACE INTO products
  (id, name, category, description, price, tag, image, featured, visible, stock)
VALUES
  ('kit-inicio-grow', 'Kit inicio grow', 'grow', 'Base simple para arrancar: maceta, sustrato y medidor.', 28000, 'Grow', '', 1, 1, 8),
  ('bong-neon', 'Bong vidrio neon', 'parafernalia', 'Pieza de vidrio con detalle de color y buena presencia en vidriera.', 42000, 'Smoke', '', 0, 1, 5),
  ('seda-premium', 'Sedas premium', 'parafernalia', 'Pack de sedas finas para rotacion diaria.', 2500, 'Accesorio', '', 0, 1, 35),
  ('grinder-metal', 'Picador metalico', 'picadores', 'Grinder resistente de cuatro partes con cierre magnetico.', 15500, 'Destacado', '', 0, 1, 12),
  ('fertilizante-flora', 'Fertilizante flora', 'grow', 'Nutriente para etapa de floracion. Consultar marcas disponibles.', 18500, 'Grow', '', 0, 1, 10),
  ('bandeja-rolling', 'Bandeja rolling', 'parafernalia', 'Bandeja practica para preparar y mantener todo ordenado.', 9800, 'Smoke', '', 0, 1, 15);

-- Migración: columna user_id en orders (ejecutar si la tabla ya existe)
-- ALTER TABLE orders ADD COLUMN user_id INTEGER;
