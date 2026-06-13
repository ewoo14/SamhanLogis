-- V9__add_partner_order_collab_tables.sql
-- 주문 협업 댓글/수정이력 — shared/collab-core partner-order rollout.
--
-- collab-core 는 @MappedSuperclass 만 제공하므로 주문 도메인 concrete table 을 둔다.
-- document_type CHECK 는 enum 확장 시 함께 갱신하는 가드다.

CREATE TABLE IF NOT EXISTS partner_order_collab_comments (
    id              UUID         PRIMARY KEY,
    document_type   VARCHAR(40)  NOT NULL
                    CHECK (document_type IN (
                        'DISPATCH_TASK',
                        'SLIP_OUTBOUND',
                        'SLIP_INBOUND',
                        'ACCOUNTING_VOUCHER',
                        'PARTNER_ORDER',
                        'ESTIMATE')),
    document_id     UUID         NOT NULL,
    anchor          VARCHAR(120),
    author_id       UUID         NOT NULL,
    author_name     VARCHAR(50)  NOT NULL,
    body            VARCHAR(500) NOT NULL,
    parent_id       UUID,
    status          VARCHAR(20)  NOT NULL
                    CHECK (status IN ('OPEN','RESOLVED')),

    -- BaseEntity 7 audit
    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE partner_order_collab_comments IS
    '주문 협업 댓글 — shared/collab-core CollabCommentService 주문 적용';

COMMENT ON COLUMN partner_order_collab_comments.author_name IS
    'UUID 비공개 가드 — 사용자 화면 노출 식별자. author_id UUID 와 분리';

CREATE INDEX IF NOT EXISTS ix_partner_order_collab_comments_document_timeline
    ON partner_order_collab_comments (document_type, document_id, created_at);

CREATE INDEX IF NOT EXISTS ix_partner_order_collab_comments_document_active
    ON partner_order_collab_comments (document_type, document_id)
    WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS partner_order_collab_suggestions (
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

COMMENT ON TABLE partner_order_collab_suggestions IS
    '주문 협업 수정 이력 — accept 시 PartnerOrderDocumentCollaborationPort 가 memo/dueDate/라인비고 overlay 경로 적용';

COMMENT ON COLUMN partner_order_collab_suggestions.proposer_name IS
    'UUID 비공개 가드 — 사용자 화면 노출 식별자. proposer_id UUID 와 분리';

CREATE INDEX IF NOT EXISTS ix_partner_order_collab_suggestions_document_timeline
    ON partner_order_collab_suggestions (document_type, document_id, created_at);

CREATE INDEX IF NOT EXISTS ix_partner_order_collab_suggestions_document_active
    ON partner_order_collab_suggestions (document_type, document_id)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS ix_partner_order_collab_suggestions_status
    ON partner_order_collab_suggestions (status)
    WHERE is_deleted = FALSE;
