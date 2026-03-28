-- ============================================================
-- NexaSense AI — Master Production Schema (V6.3)
-- 1:1 MIRROR MATCH WITH LIVE DUMP: March 28, 2026
-- ============================================================

-- ── 1. EXTENSIONS ───────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 2. FUNCTIONS ─────────────────────────────────────────────

-- Sync role name/ID automatically
CREATE OR REPLACE FUNCTION public.sync_user_role_columns() RETURNS trigger AS $$
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

-- Update Search Vector for AI Retrieval
CREATE OR REPLACE FUNCTION public.update_chunk_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update Timestamps automatically
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 3. TABLES ───────────────────────────────────────────────

-- Roles
CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name character varying(50) NOT NULL UNIQUE,
    description text,
    created_at timestamp with time zone DEFAULT now()
);

-- Permissions
CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name character varying(100) NOT NULL UNIQUE,
    description text,
    created_at timestamp with time zone DEFAULT now()
);

-- Role-Permission link
CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Users
CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    email character varying(255) NOT NULL UNIQUE,
    password_hash text NOT NULL,
    full_name character varying(255),
    role character varying(20) DEFAULT 'user'::character varying NOT NULL,
    role_id uuid REFERENCES public.roles(id),
    credits integer DEFAULT 100,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Documents
CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    file_name character varying(255) NOT NULL,
    file_size bigint DEFAULT 0 CONSTRAINT check_file_size_positive CHECK (file_size >= 0),
    status character varying(50) DEFAULT 'uploading'::character varying,
    chunk_count integer DEFAULT 0,
    error_msg text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    original_name character varying(255)
);

-- Chunks (Verified: includes role and metadata)
CREATE TABLE public.chunks (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    content text NOT NULL,
    chunk_index integer NOT NULL CONSTRAINT check_chunk_index_positive CHECK (chunk_index >= 0),
    page_number integer DEFAULT 1,
    search_vector tsvector,
    role text DEFAULT 'GENERAL_CONTENT'::text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

-- Conversations
CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE,
    question text,
    answer text,
    sources jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

-- Messages
CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])),
    content text NOT NULL,
    token_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

-- Auth Sessions
CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- Analytics
CREATE TABLE public.query_metrics (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
    question text,
    total_ms integer DEFAULT 0,
    rewrite_ms integer DEFAULT 0,
    vector_search_ms integer DEFAULT 0,
    keyword_search_ms integer DEFAULT 0,
    reranker_ms integer DEFAULT 0,
    llm_ms integer DEFAULT 0,
    chunks_retrieved integer DEFAULT 0,
    chunks_used integer DEFAULT 0,
    from_cache boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

-- Payments
CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    amount numeric(10,2) NOT NULL CONSTRAINT check_amount_positive CHECK (amount >= 0),
    currency character varying(10) DEFAULT 'INR'::character varying,
    credits_bought integer NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    razorpay_order_id character varying(100) UNIQUE,
    razorpay_payment_id character varying(100),
    razorpay_signature text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- ── 4. INDEXES (SPEED OPTIMIZATIONS) ───────────────────────────
CREATE INDEX idx_chunks_document_id ON public.chunks(document_id);
CREATE INDEX idx_chunks_search ON public.chunks USING gin(search_vector);
CREATE INDEX idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX idx_conversations_document_id ON public.conversations(document_id);
CREATE INDEX idx_conversations_metadata ON public.conversations USING gin(metadata);
CREATE INDEX idx_conversations_sources ON public.conversations USING gin(sources);
CREATE INDEX idx_documents_status ON public.documents(status);
CREATE INDEX idx_documents_user_id ON public.documents(user_id);
CREATE INDEX idx_messages_conv_time ON public.messages(conversation_id, created_at);
CREATE INDEX idx_messages_role ON public.messages(conversation_id, role);
CREATE INDEX idx_metrics_document ON public.query_metrics(document_id);
CREATE INDEX idx_metrics_user ON public.query_metrics(user_id);
CREATE INDEX idx_refresh_tokens_token ON public.refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens(user_id);
CREATE INDEX idx_transactions_order_id ON public.transactions(razorpay_order_id);
CREATE INDEX idx_transactions_status ON public.transactions(status);
CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_is_active ON public.users(is_active);
CREATE INDEX idx_users_role_id ON public.users(role_id);

-- ── 5. TRIGGERS ──────────────────────────────────────────────
CREATE TRIGGER trg_chunks_search_vector BEFORE INSERT OR UPDATE OF content ON public.chunks FOR EACH ROW EXECUTE FUNCTION public.update_chunk_search_vector();
CREATE TRIGGER trg_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_users_role_sync BEFORE INSERT OR UPDATE OF role, role_id ON public.users FOR EACH ROW EXECUTE FUNCTION public.sync_user_role_columns();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trigger_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 6. SEED DATA ─────────────────────────────────────────────
INSERT INTO roles (name, description) 
VALUES ('admin', 'System Administrator'), ('user', 'Standard User')
ON CONFLICT (name) DO NOTHING;