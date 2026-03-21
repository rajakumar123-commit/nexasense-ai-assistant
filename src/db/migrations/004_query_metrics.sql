-- ============================================================
-- Migration 004 - Query Metrics Table
-- NexaSense AI Assistant
-- Tracks per-query performance for dashboard analytics
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS query_metrics (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id       UUID        REFERENCES documents(id) ON DELETE SET NULL,
  question          TEXT,

  -- Latency breakdown (milliseconds)
  total_ms          INT         DEFAULT 0,
  rewrite_ms        INT         DEFAULT 0,
  vector_search_ms  INT         DEFAULT 0,
  keyword_search_ms INT         DEFAULT 0,
  reranker_ms       INT         DEFAULT 0,
  llm_ms            INT         DEFAULT 0,

  -- Retrieval stats
  chunks_retrieved  INT         DEFAULT 0,
  chunks_used       INT         DEFAULT 0,
  from_cache        BOOLEAN     DEFAULT FALSE,

  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Index for dashboard: queries per user per day
CREATE INDEX IF NOT EXISTS idx_metrics_user_id
  ON query_metrics(user_id);

-- Index for time-based aggregation
CREATE INDEX IF NOT EXISTS idx_metrics_created_at
  ON query_metrics(created_at DESC);

-- Index for per-document analytics
CREATE INDEX IF NOT EXISTS idx_metrics_document_id
  ON query_metrics(document_id);

-- Composite index for daily query count per user
CREATE INDEX IF NOT EXISTS idx_metrics_user_created
  ON query_metrics(user_id, created_at DESC);

COMMIT;