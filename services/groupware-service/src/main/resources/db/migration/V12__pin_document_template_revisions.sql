-- V12__pin_document_template_revisions.sql
-- DS-3a — 승인 완료 시점의 문서 레이아웃 revision을 append-only 이력으로 보존한다.
-- 결재 문서의 기존 template_id는 입력 양식(approval_templates) 참조이므로 별도 컬럼을 추가한다.
--
-- FABLE5 R1 M-4: 레포 전역 컨벤션은 아니지만(D-848-02는 #848이 한 일의 기록일 뿐 전역
-- 규약이 아니며 accounting V60~V63은 미사용) approval_lines가 핵심 감사 테이블이고 본
-- 마이그가 ADD COLUMN + 복합 FK 검증을 거는 만큼 권고 사항으로 추가한다.
SET LOCAL lock_timeout = '5s';

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
    is_backfilled   BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT ck_document_template_revisions_revision CHECK (revision > 0),
    CONSTRAINT ux_document_template_revisions_template_revision UNIQUE (template_id, revision)
);

-- FABLE5 R1 LOW: UNIQUE(template_id, revision) 제약이 동일 컬럼·동일 순서의 backing
-- btree 인덱스를 이미 생성하므로, 별도 CREATE INDEX는 완전 중복이라 추가하지 않는다.

-- 현재 document_templates 상태만 이력으로 남긴다. 승인 문서는 소급 pin하지 않는다.
-- 기존 행에서 revision 생성 시각/작성자를 복원할 근거가 없고 modified_*는 활성화/비활성화
-- 행위자에 의해 덮어써질 수 있으므로, 이를 감사 사실처럼 복제하지 않는다. backfill 행 자체의
-- 생성 시각과 검증 불가 상태를 별도 표식으로 남긴다.
INSERT INTO document_template_revisions (
    id, template_id, revision, schema_version, document,
    created_at, created_by, is_deleted, is_backfilled
)
SELECT gen_random_uuid(), id, revision, schema_version, document,
       CURRENT_TIMESTAMP, 'V12_BACKFILL_UNVERIFIED', FALSE, TRUE
  FROM document_templates;

ALTER TABLE approval_lines
    ADD COLUMN document_template_id       UUID,
    ADD COLUMN document_template_revision INT,
    ADD COLUMN document_template_default_pinned BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE approval_lines
    ADD CONSTRAINT ck_approval_lines_document_template_pin_pair
    CHECK ((document_template_id IS NULL) = (document_template_revision IS NULL));

ALTER TABLE approval_lines
    ADD CONSTRAINT ck_approval_lines_document_template_default_pin
    CHECK (NOT document_template_default_pinned
           OR (document_template_id IS NULL AND document_template_revision IS NULL));

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
