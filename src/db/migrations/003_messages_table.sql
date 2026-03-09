-- =====================================================
-- Migration 003: Messages table for conversation history
-- Run this ONCE in PostgreSQL:
--   psql -U postgres -d nexasense -f 003_messages_table.sql
-- =====================================================

CREATE TABLE IF NOT EXISTS messages (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id  UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             TEXT        NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content          TEXT        NOT NULL,
  token_count      INTEGER     DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast history retrieval per conversation (ordered by time)
CREATE INDEX IF NOT EXISTS idx_messages_conv_time
  ON messages(conversation_id, created_at ASC);

-- Index for role-based filtering
CREATE INDEX IF NOT EXISTS idx_messages_role
  ON messages(conversation_id, role);