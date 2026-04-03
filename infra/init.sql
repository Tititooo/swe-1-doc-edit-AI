-- =============================================================
-- Collaborative Document Editor — Database Initialisation
-- PostgreSQL 16
-- Run once on a fresh database to create all tables, types,
-- constraints, and indexes required by the application.
-- =============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- ENUM TYPES
-- =============================================================

CREATE TYPE permission_role AS ENUM ('owner', 'editor', 'commenter', 'viewer');

CREATE TYPE ai_feature AS ENUM ('rewrite', 'summarize', 'translate', 'restructure');

CREATE TYPE ai_status AS ENUM ('accepted', 'rejected', 'partial', 'cancelled');

-- =============================================================
-- USERS
-- Stores authentication credentials and per-user AI quota.
-- The daily token counter resets automatically when the current
-- timestamp exceeds ai_tokens_reset_at (no scheduled job needed).
-- =============================================================

CREATE TABLE IF NOT EXISTS users (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email               TEXT        NOT NULL UNIQUE,
    hashed_password     TEXT        NOT NULL,
    name                TEXT        NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    daily_ai_tokens_used INT        NOT NULL DEFAULT 0,
    ai_tokens_reset_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 day')
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- =============================================================
-- DOCUMENTS
-- Stores document metadata only. Content lives in
-- document_versions as Yjs binary state (bytea).
-- is_deleted enables 30-day soft deletion with recovery.
-- owner_id is denormalized here for fast ownership lookups
-- without a join into permissions.
-- =============================================================

CREATE TABLE IF NOT EXISTS documents (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT        NOT NULL DEFAULT 'Untitled Document',
    owner_id    UUID        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted  BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_documents_owner_id  ON documents (owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_is_deleted ON documents (is_deleted);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================
-- DOCUMENT VERSIONS
-- Append-only version history. The full Yjs CRDT binary state
-- is stored as bytea — NOT a diff. Revert operations load the
-- target snapshot, apply it as a new Yjs update, and insert a
-- new row; existing history is never overwritten.
-- The y-websocket server writes a snapshot every 30 seconds
-- when the document has changed.
-- =============================================================

CREATE TABLE IF NOT EXISTS document_versions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id      UUID        NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    snapshot    BYTEA       NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by  UUID        NOT NULL REFERENCES users (id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_doc_versions_doc_id     ON document_versions (doc_id);
CREATE INDEX IF NOT EXISTS idx_doc_versions_created_at ON document_versions (doc_id, created_at DESC);

-- =============================================================
-- PERMISSIONS
-- Per-document, per-user role assignments.
-- A unique constraint on (doc_id, user_id) ensures a user holds
-- exactly one role per document.
-- The owner role is also reflected in documents.owner_id for
-- fast lookup without a join.
-- =============================================================

CREATE TABLE IF NOT EXISTS permissions (
    id          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id      UUID            NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    user_id     UUID            NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role        permission_role NOT NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_permissions_doc_user UNIQUE (doc_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_permissions_doc_id  ON permissions (doc_id);
CREATE INDEX IF NOT EXISTS idx_permissions_user_id ON permissions (user_id);

-- =============================================================
-- AI INTERACTIONS
-- Audit trail linking every AI invocation to a document and user.
-- tokens_used supports cost attribution and per-user quota.
-- Records are subject to automated 90-day purge and are
-- user-deletable on demand (data minimisation / GDPR).
-- Cancelled operations produce a row with status = 'cancelled'
-- and suggestion_text = NULL.
-- =============================================================

CREATE TABLE IF NOT EXISTS ai_interactions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id          UUID        NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    feature         ai_feature  NOT NULL,
    input_text      TEXT        NOT NULL,
    suggestion_text TEXT,
    status          ai_status   NOT NULL,
    tokens_used     INT         NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_interactions_doc_id     ON ai_interactions (doc_id);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_user_id    ON ai_interactions (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_created_at ON ai_interactions (created_at);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_user_quota ON ai_interactions (user_id, created_at DESC);

-- =============================================================
-- AUTOMATED 90-DAY AI LOG PURGE
-- Runs as a scheduled job or can be called manually.
-- Creates a function + optional cron via pg_cron if available.
-- =============================================================

CREATE OR REPLACE FUNCTION purge_old_ai_interactions()
RETURNS void AS $$
BEGIN
    DELETE FROM ai_interactions
    WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- If pg_cron is available on your Render instance, enable this:
-- SELECT cron.schedule('purge-ai-logs', '0 3 * * *', 'SELECT purge_old_ai_interactions()');

-- =============================================================
-- HELPFUL VIEWS
-- =============================================================

-- Latest snapshot per document (used by collab server on startup)
CREATE OR REPLACE VIEW document_latest_snapshot AS
SELECT DISTINCT ON (doc_id)
    doc_id,
    id          AS version_id,
    snapshot,
    created_at,
    created_by
FROM document_versions
ORDER BY doc_id, created_at DESC;

-- Documents visible to a user (not deleted, has permission)
CREATE OR REPLACE VIEW user_accessible_documents AS
SELECT
    d.id,
    d.title,
    d.owner_id,
    d.created_at,
    d.updated_at,
    p.user_id,
    p.role
FROM documents d
JOIN permissions p ON p.doc_id = d.id
WHERE d.is_deleted = FALSE;
