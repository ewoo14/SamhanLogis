-- V4__add_approval_number_and_collab.sql
-- 그룹웨어 결재문서번호 + 협업 댓글/수정완료.
--
-- 결재문서번호는 전표번호 표준 yyyy/MM/dd-N 을 저장/표시 그대로 사용한다.
-- collab document_type CHECK 는 groupware 신규 테이블에만 APPROVAL_LINE 을 포함한다.

ALTER TABLE approval_lines
    ADD COLUMN IF NOT EXISTS approval_no VARCHAR(30);

ALTER TABLE approval_lines
    ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;

WITH numbered AS (
    SELECT
        id,
        to_char(COALESCE(created_at::date, CURRENT_DATE), 'YYYY/MM/DD')
            || '-' ||
        row_number() OVER (
            PARTITION BY COALESCE(created_at::date, CURRENT_DATE)
            ORDER BY created_at, id
        ) AS generated_no
    FROM approval_lines
    WHERE approval_no IS NULL
)
UPDATE approval_lines a
SET approval_no = numbered.generated_no
FROM numbered
WHERE a.id = numbered.id;

ALTER TABLE approval_lines
    ALTER COLUMN approval_no SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_approval_lines_approval_no_active
    ON approval_lines (approval_no)
    WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS approval_number_sequences (
    id              UUID         PRIMARY KEY,
    approval_date   DATE         NOT NULL,
    last_seq        INT          NOT NULL DEFAULT 0,
    version         BIGINT       NOT NULL DEFAULT 0,

    -- BaseEntity 7 audit
    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT ux_approval_number_sequences_date UNIQUE (approval_date)
);

INSERT INTO approval_number_sequences
    (id, approval_date, last_seq, version, created_at, created_by, is_deleted)
SELECT
    gen_random_uuid(),
    to_date(split_part(approval_no, '-', 1), 'YYYY/MM/DD') AS approval_date,
    max(split_part(approval_no, '-', 2)::int) AS last_seq,
    0,
    CURRENT_TIMESTAMP,
    'system',
    false
FROM approval_lines
WHERE is_deleted = FALSE
GROUP BY to_date(split_part(approval_no, '-', 1), 'YYYY/MM/DD')
ON CONFLICT (approval_date) DO UPDATE
SET last_seq = GREATEST(approval_number_sequences.last_seq, EXCLUDED.last_seq),
    modified_at = CURRENT_TIMESTAMP,
    modified_by = 'system';

CREATE TABLE IF NOT EXISTS approval_collab_comments (
    id              UUID         PRIMARY KEY,
    document_type   VARCHAR(40)  NOT NULL
                    CHECK (document_type IN (
                        'DISPATCH_TASK',
                        'SLIP_OUTBOUND',
                        'SLIP_INBOUND',
                        'ACCOUNTING_VOUCHER',
                        'PARTNER_ORDER',
                        'ESTIMATE',
                        'APPROVAL_LINE')),
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

COMMENT ON TABLE approval_collab_comments IS
    '그룹웨어 결재 협업 댓글 — shared/collab-core CollabCommentService 결재 적용';

COMMENT ON COLUMN approval_collab_comments.author_name IS
    'UUID 비공개 가드 — 사용자 화면 노출 식별자. author_id UUID 와 분리';

CREATE INDEX IF NOT EXISTS ix_approval_collab_comments_document_timeline
    ON approval_collab_comments (document_type, document_id, created_at);

CREATE INDEX IF NOT EXISTS ix_approval_collab_comments_document_active
    ON approval_collab_comments (document_type, document_id)
    WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS approval_collab_suggestions (
    id                 UUID         PRIMARY KEY,
    document_type      VARCHAR(40)  NOT NULL
                       CHECK (document_type IN (
                           'DISPATCH_TASK',
                           'SLIP_OUTBOUND',
                           'SLIP_INBOUND',
                           'ACCOUNTING_VOUCHER',
                           'PARTNER_ORDER',
                           'ESTIMATE',
                           'APPROVAL_LINE')),
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

COMMENT ON TABLE approval_collab_suggestions IS
    '그룹웨어 결재 협업 수정 이력 — accept 시 title/content overlay 경로 적용';

COMMENT ON COLUMN approval_collab_suggestions.proposer_name IS
    'UUID 비공개 가드 — 사용자 화면 노출 식별자. proposer_id UUID 와 분리';

CREATE INDEX IF NOT EXISTS ix_approval_collab_suggestions_document_timeline
    ON approval_collab_suggestions (document_type, document_id, created_at);

CREATE INDEX IF NOT EXISTS ix_approval_collab_suggestions_document_active
    ON approval_collab_suggestions (document_type, document_id)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS ix_approval_collab_suggestions_status
    ON approval_collab_suggestions (status)
    WHERE is_deleted = FALSE;
