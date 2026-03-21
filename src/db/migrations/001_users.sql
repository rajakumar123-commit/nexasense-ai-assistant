-- ============================================================
-- Migration 001 — Users Table
-- NexaSense AI Assistant
-- ============================================================

BEGIN;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────
-- Users Table
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  full_name     VARCHAR(255),
  is_active     BOOLEAN     DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- Index for fast email lookup during login
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email
  ON users(email);

-- ─────────────────────────────────────────
-- Auto-update updated_at on row change
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;

CREATE TRIGGER trigger_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMIT;