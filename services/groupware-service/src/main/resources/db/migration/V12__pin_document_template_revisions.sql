-- V12__pin_document_template_revisions.sql
-- DS-3a — 승인 완료 시점의 문서 레이아웃 revision을 append-only 이력으로 보존한다.
-- 결재 문서의 기존 template_id는 입력 양식(approval_templates) 참조이므로 별도 컬럼을 추가한다.

CREATE TABLE document_template_revisions (
    id              UUID         PRIMARY KEY,
    template_id     UUID         NOT NULL REFERENCES document_templates(id),
    revision        INT          NOT NULL,
    schema_version  SMALLINT     NOT NULL,
    document        JSONB        NOT NULL,

    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT ck_document_template_revisions_revision CHECK (revision > 0),
    CONSTRAINT ux_document_template_revisions_template_revision UNIQUE (template_id, revision)
);

CREATE INDEX ix_document_template_revisions_template_revision
    ON document_template_revisions (template_id, revision);

-- 현재 document_templates 상태만 이력으로 남긴다. 승인 문서는 소급 pin하지 않는다.
INSERT INTO document_template_revisions (
    id, template_id, revision, schema_version, document,
    created_at, created_by, is_deleted
)
SELECT gen_random_uuid(), id, revision, schema_version, document,
       created_at, created_by, FALSE
  FROM document_templates;

ALTER TABLE approval_lines
    ADD COLUMN document_template_id       UUID,
    ADD COLUMN document_template_revision INT;

ALTER TABLE approval_lines
    ADD CONSTRAINT ck_approval_lines_document_template_pin_pair
    CHECK ((document_template_id IS NULL) = (document_template_revision IS NULL));

ALTER TABLE approval_lines
    ADD CONSTRAINT fk_approval_lines_document_template_revision
    FOREIGN KEY (document_template_id, document_template_revision)
    REFERENCES document_template_revisions (template_id, revision);

CREATE OR REPLACE FUNCTION prevent_document_template_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'document_template_revisions is append-only';
END;
$$;

CREATE TRIGGER trg_document_template_revisions_append_only
    BEFORE UPDATE OR DELETE ON document_template_revisions
    FOR EACH ROW EXECUTE FUNCTION prevent_document_template_revision_mutation();
