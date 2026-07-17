-- #810 입금자명↔거래처 학습 매핑과 통장 거래 provenance.
-- 적용 후 수정 금지: 회계 audit 및 Flyway checksum 불변 규칙.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE bank_depositor_partner_mapping (
    id              UUID          NOT NULL DEFAULT gen_random_uuid(),
    raw_name        VARCHAR(120)  NOT NULL,
    normalized_name VARCHAR(120)  NOT NULL,
    partner_id      UUID          NOT NULL,

    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      VARCHAR(50)   NOT NULL DEFAULT 'SYSTEM',
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN       NOT NULL DEFAULT FALSE,

    CONSTRAINT pk_bank_depositor_partner_mapping PRIMARY KEY (id),
    CONSTRAINT ck_bank_depositor_mapping_raw_name
        CHECK (BTRIM(raw_name) <> '' AND CHAR_LENGTH(raw_name) <= 120),
    CONSTRAINT ck_bank_depositor_mapping_normalized_name
        CHECK (BTRIM(normalized_name) <> '' AND CHAR_LENGTH(normalized_name) <= 120)
);

CREATE UNIQUE INDEX uq_bank_depositor_mapping_normalized_active
    ON bank_depositor_partner_mapping (normalized_name)
    WHERE is_deleted = FALSE;

COMMENT ON TABLE bank_depositor_partner_mapping IS
    '입금자명 정규화 키별 최신 거래처 매핑 — soft delete 및 감사 이력 보존';
COMMENT ON COLUMN bank_depositor_partner_mapping.partner_id IS
    'partner-service 거래처 내부 UUID — API business key는 partnerCode';

ALTER TABLE bank_transaction
    ADD COLUMN partner_match_source VARCHAR(30),
    ADD COLUMN matched_mapping_id UUID,
    ADD COLUMN partner_matched_at TIMESTAMP,
    ADD COLUMN partner_matched_by VARCHAR(50),
    ADD COLUMN matched_mapping_raw_name VARCHAR(120),
    ADD COLUMN matched_mapping_normalized_name VARCHAR(120);

-- 기존 수동 거래처 지정 행은 새 provenance의 MANUAL 출처로 보존한다.
UPDATE bank_transaction
SET partner_match_source = 'MANUAL',
    partner_matched_at = COALESCE(partner_matched_at, modified_at, CURRENT_TIMESTAMP),
    partner_matched_by = COALESCE(partner_matched_by, modified_by, 'MIGRATION')
WHERE matched_partner_id IS NOT NULL;

ALTER TABLE bank_transaction
    ADD CONSTRAINT ck_bank_transaction_partner_match_source
        CHECK (partner_match_source IS NULL
               OR partner_match_source IN ('MANUAL', 'DEPOSITOR_MAPPING', 'PARTNER_CODE_EXACT')),
    ADD CONSTRAINT ck_bank_transaction_partner_match_pair
        CHECK ((matched_partner_id IS NULL
                AND partner_match_source IS NULL
                AND matched_mapping_id IS NULL)
               OR (matched_partner_id IS NOT NULL
                   AND partner_match_source IS NOT NULL)),
    ADD CONSTRAINT ck_bank_transaction_depositor_mapping_id
        CHECK (partner_match_source <> 'DEPOSITOR_MAPPING'
               OR matched_mapping_id IS NOT NULL),
    ADD CONSTRAINT ck_bank_transaction_non_mapping_id
        CHECK (partner_match_source = 'DEPOSITOR_MAPPING'
               OR matched_mapping_id IS NULL);

CREATE INDEX idx_bank_transaction_matched_mapping
    ON bank_transaction (matched_mapping_id)
    WHERE matched_mapping_id IS NOT NULL;
