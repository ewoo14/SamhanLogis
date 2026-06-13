-- V46__add_dispatch_collab_edit.sql
-- DispatchTask 협업 수정완료 — memo 단일 overlay + 수정 이력.
--
-- 기존 배차 댓글(dispatch_collab_comments)은 V37 에서 생성됐으므로 본 migration 은 건드리지 않는다.

ALTER TABLE dispatch_task
    ADD COLUMN IF NOT EXISTS memo VARCHAR(1000);

ALTER TABLE dispatch_task
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS dispatch_collab_suggestions (
    id                 UUID         PRIMARY KEY,
    document_type      VARCHAR(40)  NOT NULL
                       CHECK (document_type IN (
                           'DISPATCH_TASK',
                           'SLIP_OUTBOUND',
                           'SLIP_INBOUND',
                           'ACCOUNTING_VOUCHER',
                           'PARTNER_ORDER',
                           'ESTIMATE')),
    document_id        UUID         NOT NULL,
    proposer_id        UUID         NOT NULL,
    proposer_name      VARCHAR(50)  NOT NULL,
    change_set         JSONB        NOT NULL,
    reason             VARCHAR(500),
    status             VARCHAR(20)  NOT NULL
                       CHECK (status IN ('PROPOSED','ACCEPTED','REJECTED','WITHDRAWN')),
    decided_by_id      UUID,
    decided_by_name    VARCHAR(50),
    decided_at         TIMESTAMPTZ,
    version            BIGINT       NOT NULL DEFAULT 0,

    -- BaseEntity 7 audit
    created_at         TIMESTAMP    NOT NULL,
    created_by         VARCHAR(50)  NOT NULL,
    modified_at        TIMESTAMP,
    modified_by        VARCHAR(50),
    deleted_at         TIMESTAMP,
    deleted_by         VARCHAR(50),
    is_deleted         BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE dispatch_collab_suggestions IS
    'DispatchTask 협업 수정 이력 — accept 시 DispatchDocumentCollaborationPort 가 memo overlay 경로 적용';

COMMENT ON COLUMN dispatch_collab_suggestions.proposer_name IS
    'UUID 비공개 가드 — 사용자 화면 노출 식별자. proposer_id UUID 와 분리';

CREATE INDEX IF NOT EXISTS ix_dispatch_collab_suggestions_document_timeline
    ON dispatch_collab_suggestions (document_type, document_id, created_at);

CREATE INDEX IF NOT EXISTS ix_dispatch_collab_suggestions_document_active
    ON dispatch_collab_suggestions (document_type, document_id)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS ix_dispatch_collab_suggestions_status
    ON dispatch_collab_suggestions (status)
    WHERE is_deleted = FALSE;
