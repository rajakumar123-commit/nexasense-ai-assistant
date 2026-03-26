-- ============================================================
-- Migration 005 — Billing System
-- NexaSense AI Assistant
-- Adds credits to users and creates transactions table
-- ============================================================

BEGIN;

-- 1. Add credits to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0;
UPDATE users SET credits = 100 WHERE credits IS NULL OR credits = 0;

-- 2. Add original_name to documents (Required for Scraper)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS original_name VARCHAR(255);
UPDATE documents SET original_name = file_name WHERE original_name IS NULL;

-- 2. Create Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount             DECIMAL(10,2) NOT NULL,
    currency           VARCHAR(10)   DEFAULT 'INR',
    credits_bought     INTEGER      NOT NULL,
    status             VARCHAR(50)   DEFAULT 'pending', -- 'pending', 'paid', 'failed'
    razorpay_order_id  VARCHAR(255)  UNIQUE,
    razorpay_payment_id VARCHAR(255),
    razorpay_signature  TEXT,
    created_at         TIMESTAMPTZ   DEFAULT NOW(),
    updated_at         TIMESTAMPTZ   DEFAULT NOW()
);

-- 3. Trigger for updated_at on transactions
DROP TRIGGER IF EXISTS trigger_transactions_updated_at ON transactions;
CREATE TRIGGER trigger_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON transactions(razorpay_order_id);

COMMIT;
