-- V26__add_ecount_mig6_master_staging.sql
-- MIG-6 이카운트 통장계좌/고정자산유형 raw staging + domain tables.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE IF NOT EXISTS bank_accounts (
    id                  UUID         NOT NULL DEFAULT gen_random_uuid(),
    account_code        VARCHAR(50)  NOT NULL,
    account_name        VARCHAR(100) NOT NULL,
    chart_account_code  VARCHAR(10),
    search_content      TEXT,
    memo                TEXT,
    foreign_currency    BOOLEAN      NOT NULL DEFAULT FALSE,
    active              BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(50)  NOT NULL DEFAULT 'system',
    modified_at         TIMESTAMP,
    modified_by         VARCHAR(50),
    deleted_at          TIMESTAMP,
    deleted_by          VARCHAR(50),
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT bank_accounts_pk PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_bank_accounts_code_active
    ON bank_accounts (account_code)
    WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS fixed_asset_types (
    id                  UUID         NOT NULL DEFAULT gen_random_uuid(),
    type_code           VARCHAR(50)  NOT NULL,
    type_name           VARCHAR(100) NOT NULL,
    active              BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(50)  NOT NULL DEFAULT 'system',
    modified_at         TIMESTAMP,
    modified_by         VARCHAR(50),
    deleted_at          TIMESTAMP,
    deleted_by          VARCHAR(50),
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT fixed_asset_types_pk PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_fixed_asset_types_code_active
    ON fixed_asset_types (type_code)
    WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS staging.ecount_bank_account_raw (
    source_file_hash        VARCHAR(64) NOT NULL,
    source_row_no           INT         NOT NULL,
    account_code            TEXT,
    account_name            TEXT,
    account_chart_code      VARCHAR(10),
    account_chart_raw       TEXT,
    search_content          TEXT,
    memo                    TEXT,
    foreign_currency_raw    TEXT,
    usage_flag_raw          TEXT,
    raw_payload             TEXT,
    transform_status        VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    target_bank_account_id  UUID,
    reject_reason           TEXT,
    created_at              TIMESTAMP   NOT NULL DEFAULT NOW(),
    created_by              VARCHAR(50) NOT NULL,
    modified_at             TIMESTAMP   NOT NULL DEFAULT NOW(),
    modified_by             VARCHAR(50) NOT NULL,
    deleted_at              TIMESTAMP,
    deleted_by              VARCHAR(50),
    is_deleted              BOOLEAN     NOT NULL DEFAULT FALSE,
    PRIMARY KEY (source_file_hash, source_row_no)
);

CREATE INDEX IF NOT EXISTS ix_ecount_bank_account_raw_code
    ON staging.ecount_bank_account_raw (account_code);

CREATE TABLE IF NOT EXISTS staging.ecount_fixed_asset_type_raw (
    source_file_hash            VARCHAR(64) NOT NULL,
    source_row_no               INT         NOT NULL,
    type_code                   TEXT,
    type_name                   TEXT,
    usage_flag_raw              TEXT,
    raw_payload                 TEXT,
    transform_status            VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    target_fixed_asset_type_id  UUID,
    reject_reason               TEXT,
    created_at                  TIMESTAMP   NOT NULL DEFAULT NOW(),
    created_by                  VARCHAR(50) NOT NULL,
    modified_at                 TIMESTAMP   NOT NULL DEFAULT NOW(),
    modified_by                 VARCHAR(50) NOT NULL,
    deleted_at                  TIMESTAMP,
    deleted_by                  VARCHAR(50),
    is_deleted                  BOOLEAN     NOT NULL DEFAULT FALSE,
    PRIMARY KEY (source_file_hash, source_row_no)
);

CREATE INDEX IF NOT EXISTS ix_ecount_fixed_asset_type_raw_code
    ON staging.ecount_fixed_asset_type_raw (type_code);
