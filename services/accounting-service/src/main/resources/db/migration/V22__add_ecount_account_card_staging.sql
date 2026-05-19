-- V22__add_ecount_account_card_staging.sql
-- MIG-2 이카운트 계정상세내역 + 통장계좌 staging / card_master / account lookup map.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS staging;

ALTER TABLE chart_of_accounts ALTER COLUMN code TYPE VARCHAR(10);
ALTER TABLE chart_of_accounts ALTER COLUMN parent_code TYPE VARCHAR(10);
ALTER TABLE journal_lines ALTER COLUMN account_code TYPE VARCHAR(10);

CREATE TABLE IF NOT EXISTS staging.ecount_account_raw (
    source_file_hash        VARCHAR(64) NOT NULL,
    source_row_no           INT         NOT NULL,
    raw_account_code        TEXT,
    raw_account_name        TEXT,
    raw_search_keyword      TEXT,
    raw_debit_credit        TEXT,
    raw_account_attribute   TEXT,
    raw_account_type        TEXT,
    raw_income_expense_type TEXT,
    raw_fs_parent_code      TEXT,
    raw_disabled            TEXT,
    raw_payload             TEXT,
    transform_status        VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    target_account_code     VARCHAR(10),
    reject_reason           TEXT,
    imported_at             TIMESTAMP   NOT NULL DEFAULT NOW(),
    imported_by             VARCHAR(50) NOT NULL,
    PRIMARY KEY (source_file_hash, source_row_no),
    CONSTRAINT chk_ecount_account_raw_transform_status CHECK (
        transform_status IN ('PENDING', 'IMPORTED', 'UPDATED', 'REJECT_NAME_NULL', 'SKIPPED_PLACEHOLDER')
    )
);

CREATE INDEX IF NOT EXISTS ix_ecount_account_raw_status
    ON staging.ecount_account_raw (transform_status);

CREATE TABLE IF NOT EXISTS staging.ecount_account_map (
    ecount_code       VARCHAR(10) PRIMARY KEY,
    account_uuid      VARCHAR(10) NOT NULL,
    account_name      VARCHAR(100),
    source_file_hash  VARCHAR(64) NOT NULL,
    updated_at        TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS card_master (
    id                  UUID         NOT NULL DEFAULT gen_random_uuid(),
    card_code           VARCHAR(50)  NOT NULL,
    card_name           VARCHAR(100) NOT NULL,
    card_type           VARCHAR(20)  NOT NULL,
    account_number      VARCHAR(50),
    linked_account_code VARCHAR(10),
    note                TEXT,
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(50)  NOT NULL DEFAULT 'system',
    modified_at         TIMESTAMP,
    modified_by         VARCHAR(50),
    deleted_at          TIMESTAMP,
    deleted_by          VARCHAR(50),
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT card_master_pk PRIMARY KEY (id),
    CONSTRAINT chk_card_master_type CHECK (card_type IN ('CREDIT', 'DEBIT', 'BANK_ACCOUNT'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_card_master_code_active
    ON card_master (card_code)
    WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS staging.ecount_card_raw (
    source_file_hash        VARCHAR(64) NOT NULL,
    source_row_no           INT         NOT NULL,
    raw_account_code        TEXT,
    raw_account_name        TEXT,
    raw_linked_account      TEXT,
    raw_search_keyword      TEXT,
    raw_memo                TEXT,
    raw_foreign_account     TEXT,
    raw_usage_flag          TEXT,
    transform_status        VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    target_card_id          UUID,
    reject_reason           TEXT,
    imported_at             TIMESTAMP   NOT NULL DEFAULT NOW(),
    imported_by             VARCHAR(50) NOT NULL,
    PRIMARY KEY (source_file_hash, source_row_no),
    CONSTRAINT chk_ecount_card_raw_transform_status CHECK (
        transform_status IN ('PENDING', 'IMPORTED', 'UPDATED', 'REJECT_NAME_NULL', 'SKIPPED_PLACEHOLDER')
    )
);

CREATE INDEX IF NOT EXISTS ix_ecount_card_raw_status
    ON staging.ecount_card_raw (transform_status);
