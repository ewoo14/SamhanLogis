-- DS-2 document layout persistence. No seed: absent ACTIVE rows intentionally use FE DEFAULT.
CREATE TABLE document_templates (
    id              UUID         PRIMARY KEY,
    doc_type        VARCHAR(40)  NOT NULL,
    name            VARCHAR(100) NOT NULL,
    revision        INT          NOT NULL,
    status          VARCHAR(20)  NOT NULL,
    schema_version  SMALLINT     NOT NULL,
    lock_version    BIGINT       NOT NULL DEFAULT 0,
    document        JSONB        NOT NULL,

    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT ck_document_templates_status CHECK (status IN ('DRAFT', 'ACTIVE'))
);

CREATE UNIQUE INDEX ux_document_templates_active_doc_type
    ON document_templates (doc_type)
    WHERE status = 'ACTIVE' AND is_deleted = FALSE;

CREATE UNIQUE INDEX ux_document_templates_name_active
    ON document_templates (doc_type, name)
    WHERE is_deleted = FALSE;

-- Legacy approval lines can exceed the shared VARCHAR(40) document_type width.
-- Those rows remain NULL and deliberately fall back to the renderer DEFAULT.
UPDATE approval_lines
SET document_type = 'GROUPWARE_' || t.code
FROM approval_templates t
WHERE approval_lines.template_id = t.id
  AND approval_lines.document_type IS NULL
  AND length('GROUPWARE_' || t.code) <= 40;
