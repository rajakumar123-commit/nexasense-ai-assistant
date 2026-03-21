-- ============================================================
-- Migration 002 - Update Documents Table
-- NexaSense AI Assistant
-- Add user_id, status, chunk_count to documents
-- ============================================================

BEGIN;

-- Create documents table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS documents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name   VARCHAR(255) NOT NULL,
  file_size   BIGINT      DEFAULT 0,
  status      VARCHAR(50) DEFAULT 'uploading',
  chunk_count INT         DEFAULT 0,
  error_msg   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- If documents table already exists, safely add missing columns
DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE documents
      ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'status'
  ) THEN
    ALTER TABLE documents
      ADD COLUMN status VARCHAR(50) DEFAULT 'uploading';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'chunk_count'
  ) THEN
    ALTER TABLE documents
      ADD COLUMN chunk_count INT DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'file_size'
  ) THEN
    ALTER TABLE documents
      ADD COLUMN file_size BIGINT DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'error_msg'
  ) THEN
    ALTER TABLE documents
      ADD COLUMN error_msg TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE documents
      ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

END $$;

-- Index for fast user document listing
CREATE INDEX IF NOT EXISTS idx_documents_user_id
  ON documents(user_id);

-- Index for status polling
CREATE INDEX IF NOT EXISTS idx_documents_status
  ON documents(status);

-- Auto-update updated_at trigger
DROP TRIGGER IF EXISTS trigger_documents_updated_at ON documents;

CREATE TRIGGER trigger_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Status check constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'documents'
    AND constraint_name = 'documents_status_check'
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_status_check
      CHECK (status IN (
        'uploading',
        'extracting',
        'chunking',
        'embedding',
        'storing',
        'ready',
        'error'
      ));
  END IF;
END $$;

COMMIT;