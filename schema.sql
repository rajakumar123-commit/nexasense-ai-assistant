-- ============================================================
-- NexaSense FINAL Schema (RAG SAFE + AUTH COMPLETE)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- RBAC FOUNDATION
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(255),

  role VARCHAR(20) NOT NULL DEFAULT 'user',
  role_id UUID REFERENCES roles(id),
  credits INT DEFAULT 100,

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

-- ============================================================
-- DOCUMENTS (RAG SAFE)
-- ============================================================

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255),
  file_size BIGINT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'uploading',
  chunk_count INT DEFAULT 0,
  error_msg TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

-- ============================================================
-- CHUNKS (RAG CORE)
-- ============================================================

CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INT NOT NULL,
  page_number INT DEFAULT 1,
  search_vector TSVECTOR,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_search ON chunks USING GIN(search_vector);

-- ============================================================
-- CONVERSATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  question TEXT,
  answer TEXT,
  sources JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_document_id ON conversations(document_id);

-- ============================================================
-- MESSAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  token_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_time
ON messages(conversation_id, created_at);

-- ============================================================
-- QUERY METRICS
-- ============================================================

CREATE TABLE IF NOT EXISTS query_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  question TEXT,
  total_ms INT DEFAULT 0,
  rewrite_ms INT DEFAULT 0,
  vector_search_ms INT DEFAULT 0,
  keyword_search_ms INT DEFAULT 0,
  reranker_ms INT DEFAULT 0,
  llm_ms INT DEFAULT 0,
  chunks_retrieved INT DEFAULT 0,
  chunks_used INT DEFAULT 0,
  from_cache BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_user ON query_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_metrics_document ON query_metrics(document_id);

-- ============================================================
-- REFRESH TOKENS (NEW - AUTH FIX)
-- ============================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);

-- ============================================================
-- TRANSACTIONS (RAZORPAY)
-- ============================================================

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  credits_bought INT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  razorpay_order_id VARCHAR(100) UNIQUE,
  razorpay_payment_id VARCHAR(100),
  razorpay_signature TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_order_id ON transactions(razorpay_order_id);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Search vector auto update
CREATE OR REPLACE FUNCTION update_chunk_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chunks_search_vector ON chunks;
CREATE TRIGGER trg_chunks_search_vector
BEFORE INSERT OR UPDATE OF content ON chunks
FOR EACH ROW EXECUTE FUNCTION update_chunk_search_vector();

-- updated_at auto update
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
CREATE TRIGGER trg_documents_updated_at
BEFORE UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Role sync (VERY IMPORTANT)
CREATE OR REPLACE FUNCTION sync_user_role_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role_id IS DISTINCT FROM OLD.role_id AND NEW.role_id IS NOT NULL THEN
    SELECT name INTO NEW.role FROM roles WHERE id = NEW.role_id;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    SELECT id INTO NEW.role_id FROM roles WHERE name = NEW.role;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_role_sync ON users;
CREATE TRIGGER trg_users_role_sync
BEFORE INSERT OR UPDATE OF role, role_id ON users
FOR EACH ROW EXECUTE FUNCTION sync_user_role_columns();