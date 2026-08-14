-- #901 S3 — 화면 종료 후에도 Claude 세션을 식별할 수 있도록 서버에 보존한다.
CREATE TABLE IF NOT EXISTS claude_conversation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL,
    session_code VARCHAR(40) NOT NULL UNIQUE,
    title VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(50) NOT NULL DEFAULT 'claude-conversation',
    modified_at TIMESTAMP,
    modified_by VARCHAR(50),
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(50),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);
ALTER TABLE claude_conversation_audits ADD COLUMN IF NOT EXISTS session_code VARCHAR(40);
CREATE INDEX IF NOT EXISTS idx_claude_session_account ON claude_conversation_sessions(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claude_audit_session ON claude_conversation_audits(session_code);
