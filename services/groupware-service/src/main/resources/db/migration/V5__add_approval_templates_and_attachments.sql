-- V5__add_approval_templates_and_attachments.sql
-- §7 그룹웨어 결재 확장 — 결재유형 템플릿 빌더 + 결재 첨부.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS approval_templates (
    id              UUID         PRIMARY KEY,
    code            VARCHAR(60)  NOT NULL,
    name            VARCHAR(100) NOT NULL,
    description     VARCHAR(500),
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    display_order   INT          NOT NULL DEFAULT 0,

    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_approval_templates_code_active
    ON approval_templates (code)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS ix_approval_templates_active_order
    ON approval_templates (active, display_order, name)
    WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS approval_template_fields (
    id              UUID          PRIMARY KEY,
    template_id     UUID          NOT NULL REFERENCES approval_templates(id),
    field_key       VARCHAR(80)   NOT NULL,
    label           VARCHAR(100)  NOT NULL,
    field_type      VARCHAR(20)   NOT NULL
                    CHECK (field_type IN ('TEXT','NUMBER','DATE','SELECT','TEXTAREA')),
    required        BOOLEAN       NOT NULL DEFAULT FALSE,
    display_order   INT           NOT NULL DEFAULT 0,
    options_json    VARCHAR(1000),
    placeholder     VARCHAR(200),

    created_at      TIMESTAMP     NOT NULL,
    created_by      VARCHAR(50)   NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN       NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_approval_template_fields_key_active
    ON approval_template_fields (template_id, field_key)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS ix_approval_template_fields_order_active
    ON approval_template_fields (template_id, display_order, field_key)
    WHERE is_deleted = FALSE;

ALTER TABLE approval_lines
    ADD COLUMN IF NOT EXISTS template_id UUID;

ALTER TABLE approval_lines
    ADD COLUMN IF NOT EXISTS field_values JSONB;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_approval_lines_template'
    ) THEN
        ALTER TABLE approval_lines
            ADD CONSTRAINT fk_approval_lines_template
            FOREIGN KEY (template_id) REFERENCES approval_templates(id);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS approval_attachments (
    id                  UUID          PRIMARY KEY,
    approval_id         UUID          NOT NULL REFERENCES approval_lines(id),
    attachment_type     VARCHAR(30)   NOT NULL
                        CHECK (attachment_type IN ('SLIP_REF','PARTNER_LEDGER_REF','FILE')),
    label               VARCHAR(100)  NOT NULL,
    display_order       INT           NOT NULL DEFAULT 0,
    ref_slip_no         VARCHAR(40),
    ref_slip_type       VARCHAR(40),
    ref_partner_code    VARCHAR(40),
    ref_partner_name    VARCHAR(100),
    ref_period          VARCHAR(7),
    storage_key         VARCHAR(500),
    file_name           VARCHAR(200),
    content_type        VARCHAR(100),
    file_size           BIGINT,

    created_at          TIMESTAMP     NOT NULL,
    created_by          VARCHAR(50)   NOT NULL,
    modified_at         TIMESTAMP,
    modified_by         VARCHAR(50),
    deleted_at          TIMESTAMP,
    deleted_by          VARCHAR(50),
    is_deleted          BOOLEAN       NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS ix_approval_attachments_approval_order_active
    ON approval_attachments (approval_id, display_order, created_at)
    WHERE is_deleted = FALSE;

-- 지출결의서 / 휴가신청서 기본 템플릿 시드.
INSERT INTO approval_templates
    (id, code, name, description, active, display_order,
     created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
    ('00000000-0000-0000-0000-000000007001'::uuid, 'EXPENSE_REPORT', '지출결의서',
     '지출항목, 금액, 계정과목, 지출일, 적요를 입력하는 기본 결재 양식', TRUE, 10,
     NOW(), 'v5-approval-templates', NOW(), 'v5-approval-templates', FALSE),
    ('00000000-0000-0000-0000-000000007002'::uuid, 'LEAVE_REQUEST', '휴가신청서',
     '휴가종류, 시작일, 종료일, 사유를 입력하는 기본 결재 양식', TRUE, 20,
     NOW(), 'v5-approval-templates', NOW(), 'v5-approval-templates', FALSE)
ON CONFLICT (code) WHERE is_deleted = FALSE DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    active = EXCLUDED.active,
    display_order = EXCLUDED.display_order,
    modified_at = NOW(),
    modified_by = 'v5-approval-templates';

INSERT INTO approval_template_fields
    (id, template_id, field_key, label, field_type, required, display_order,
     options_json, placeholder, created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
    ('00000000-0000-0000-0000-000000007101'::uuid, '00000000-0000-0000-0000-000000007001'::uuid,
     'expenseItem', '지출항목', 'TEXT', TRUE, 10, NULL, '예: 택배비', NOW(), 'v5-approval-templates', NOW(), 'v5-approval-templates', FALSE),
    ('00000000-0000-0000-0000-000000007102'::uuid, '00000000-0000-0000-0000-000000007001'::uuid,
     'amount', '금액', 'NUMBER', TRUE, 20, NULL, '숫자만 입력', NOW(), 'v5-approval-templates', NOW(), 'v5-approval-templates', FALSE),
    ('00000000-0000-0000-0000-000000007103'::uuid, '00000000-0000-0000-0000-000000007001'::uuid,
     'account', '계정과목', 'SELECT', TRUE, 30,
     '["복리후생비","여비교통비","소모품비","접대비","기타"]', NULL, NOW(), 'v5-approval-templates', NOW(), 'v5-approval-templates', FALSE),
    ('00000000-0000-0000-0000-000000007104'::uuid, '00000000-0000-0000-0000-000000007001'::uuid,
     'spentAt', '지출일', 'DATE', TRUE, 40, NULL, NULL, NOW(), 'v5-approval-templates', NOW(), 'v5-approval-templates', FALSE),
    ('00000000-0000-0000-0000-000000007105'::uuid, '00000000-0000-0000-0000-000000007001'::uuid,
     'memo', '적요', 'TEXTAREA', FALSE, 50, NULL, '지출 사유를 입력하세요', NOW(), 'v5-approval-templates', NOW(), 'v5-approval-templates', FALSE),
    ('00000000-0000-0000-0000-000000007201'::uuid, '00000000-0000-0000-0000-000000007002'::uuid,
     'leaveType', '휴가종류', 'SELECT', TRUE, 10,
     '["연차","반차(오전)","반차(오후)","병가","경조사"]', NULL, NOW(), 'v5-approval-templates', NOW(), 'v5-approval-templates', FALSE),
    ('00000000-0000-0000-0000-000000007202'::uuid, '00000000-0000-0000-0000-000000007002'::uuid,
     'startDate', '시작일', 'DATE', TRUE, 20, NULL, NULL, NOW(), 'v5-approval-templates', NOW(), 'v5-approval-templates', FALSE),
    ('00000000-0000-0000-0000-000000007203'::uuid, '00000000-0000-0000-0000-000000007002'::uuid,
     'endDate', '종료일', 'DATE', TRUE, 30, NULL, NULL, NOW(), 'v5-approval-templates', NOW(), 'v5-approval-templates', FALSE),
    ('00000000-0000-0000-0000-000000007204'::uuid, '00000000-0000-0000-0000-000000007002'::uuid,
     'reason', '사유', 'TEXTAREA', TRUE, 40, NULL, '휴가 사유를 입력하세요', NOW(), 'v5-approval-templates', NOW(), 'v5-approval-templates', FALSE)
ON CONFLICT (template_id, field_key) WHERE is_deleted = FALSE DO UPDATE
SET label = EXCLUDED.label,
    field_type = EXCLUDED.field_type,
    required = EXCLUDED.required,
    display_order = EXCLUDED.display_order,
    options_json = EXCLUDED.options_json,
    placeholder = EXCLUDED.placeholder,
    modified_at = NOW(),
    modified_by = 'v5-approval-templates';
