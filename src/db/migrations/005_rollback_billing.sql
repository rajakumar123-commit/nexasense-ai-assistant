-- ============================================================
-- Rollback Migration 005 — Billing System
-- NexaSense AI Assistant
-- Reverts credits column and transactions table
-- ============================================================

BEGIN;

-- 1. Remove Indexes
DROP INDEX IF EXISTS idx_transactions_order_id;
DROP INDEX IF EXISTS idx_transactions_user_id;

-- 2. Remove Trigger and Function
DROP TRIGGER IF EXISTS trigger_transactions_updated_at ON transactions;

-- 3. Drop Transactions Table
DROP TABLE IF EXISTS transactions;

-- 4. Remove Credits Column from users
-- WARNING: This will permanently delete user credit balances.
-- In production, you might want to skip this if you just want to revert code.
ALTER TABLE users DROP COLUMN IF EXISTS credits;

COMMIT;
