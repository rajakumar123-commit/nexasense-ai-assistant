-- ============================================================
-- Migration 003 - Update Conversations Table
-- NexaSense AI Assistant
-- Add user_id, document_id, sources, metadata columns
-- ============================================================

BEGIN;

-- Create conversations table if it doesn't exist
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id UUID        REFERENCES documents(id) ON DELETE CASCADE,
  question    TEXT        NOT NULL,
  answer      TEXT        NOT NULL,
  sources     JSONB       DEFAULT '[]',
  metadata    JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- If table already exists, safely add missing columns
DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE conversations
      ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'document_id'
  ) THEN
    ALTER TABLE conversations
      ADD COLUMN document_id UUID REFERENCES documents(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'sources'
  ) THEN
    ALTER TABLE conversations
      ADD COLUMN sources JSONB DEFAULT '[]';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE conversations
      ADD COLUMN metadata JSONB DEFAULT '{}';
  END IF;

END $$;

-- Index for fetching chat history per document
CREATE INDEX IF NOT EXISTS idx_conversations_document_id
  ON conversations(document_id);

-- Index for fetching all conversations by user
CREATE INDEX IF NOT EXISTS idx_conversations_user_id
  ON conversations(user_id);

-- Index for time-based ordering
CREATE INDEX IF NOT EXISTS idx_conversations_created_at
  ON conversations(created_at DESC);

COMMIT;