-- ════════════════════════════════════════════════
-- MIGRACIÓN: Sistema de usuarios
-- Ejecutar en Cloudflare D1:
--   wrangler d1 execute canopia-db --file=migration-users.sql
-- ════════════════════════════════════════════════

-- 1. Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  phone         TEXT    NOT NULL DEFAULT '',
  password_hash TEXT    NOT NULL,
  favs_json     TEXT    NOT NULL DEFAULT '[]',
  created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de direcciones guardadas
CREATE TABLE IF NOT EXISTS user_addresses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      TEXT    NOT NULL DEFAULT 'Casa',
  line1      TEXT    NOT NULL,
  city       TEXT    NOT NULL DEFAULT '',
  notes      TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Agregar columna user_id a orders (ignorar error si ya existe)
ALTER TABLE orders ADD COLUMN user_id INTEGER;

-- 4. Tabla de categorías
CREATE TABLE IF NOT EXISTS categories (
  name        TEXT    PRIMARY KEY,
  description TEXT    NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0
);
