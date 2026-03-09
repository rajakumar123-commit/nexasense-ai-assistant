CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email        TEXT UNIQUE NOT NULL,
  password     TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_size     INTEGER,
  page_count    INTEGER,
  status        TEXT DEFAULT 'processing'
                CHECK (status IN ('processing', 'ready', 'failed')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);

CREATE TABLE IF NOT EXISTS chunks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  chunk_index   INTEGER NOT NULL,
  page_number   INTEGER DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);

CREATE TABLE IF NOT EXISTS conversations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id   UUID REFERENCES documents(id) ON DELETE CASCADE,
  messages      JSONB DEFAULT '[]',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);