-- #901 S2 Claude 질문 및 외부 전송 범위 감사 로그. soft delete + BaseEntity 7 audit.
CREATE TABLE IF NOT EXISTS claude_conversation_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL,
    question TEXT NOT NULL,
    outbound_payload TEXT NOT NULL,
    outbound_status VARCHAR(40) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(50) NOT NULL DEFAULT 'claude-conversation',
    modified_at TIMESTAMP,
    modified_by VARCHAR(50),
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(50),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);
