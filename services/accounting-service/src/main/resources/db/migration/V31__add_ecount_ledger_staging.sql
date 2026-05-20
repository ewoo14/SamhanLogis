-- V31__add_ecount_ledger_staging.sql
-- MIG-11 이카운트 매출장/매입장 XLSX raw staging + DailyClosing 대조용 인덱스.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE IF NOT EXISTS staging.ecount_sales_ledger_raw (
    source_file_hash   VARCHAR(64) NOT NULL,
    source_row_no      INT         NOT NULL,
    transaction_ref    VARCHAR(50),
    transaction_date   DATE,
    sequence_no        INT,
    transaction_type   TEXT,
    electronic_type    TEXT,
    partner_code       VARCHAR(50),
    partner_name       TEXT,
    description        TEXT,
    supply_amount      NUMERIC(15,2),
    vat_amount         NUMERIC(15,2),
    total_amount       NUMERIC(15,2),
    raw_payload        TEXT,
    transform_status   VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    reject_reason      TEXT,
    imported_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
    imported_by        VARCHAR(50) NOT NULL,

    -- BaseEntity 7 audit
    created_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by         VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
    modified_at        TIMESTAMP,
    modified_by        VARCHAR(50),
    deleted_at         TIMESTAMP,
    deleted_by         VARCHAR(50),
    is_deleted         BOOLEAN     NOT NULL DEFAULT FALSE,

    PRIMARY KEY (source_file_hash, source_row_no)
);

CREATE INDEX IF NOT EXISTS ix_ecount_sales_ledger_raw_date
    ON staging.ecount_sales_ledger_raw (transaction_date)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_ecount_sales_ledger_raw_partner
    ON staging.ecount_sales_ledger_raw (partner_name)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_ecount_sales_ledger_raw_partner_code
    ON staging.ecount_sales_ledger_raw (partner_code)
    WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS staging.ecount_purchase_ledger_raw (
    source_file_hash   VARCHAR(64) NOT NULL,
    source_row_no      INT         NOT NULL,
    transaction_ref    VARCHAR(50),
    transaction_date   DATE,
    sequence_no        INT,
    transaction_type   TEXT,
    electronic_type    TEXT,
    partner_code       VARCHAR(50),
    partner_name       TEXT,
    description        TEXT,
    supply_amount      NUMERIC(15,2),
    vat_amount         NUMERIC(15,2),
    total_amount       NUMERIC(15,2),
    raw_payload        TEXT,
    transform_status   VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    reject_reason      TEXT,
    imported_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
    imported_by        VARCHAR(50) NOT NULL,

    -- BaseEntity 7 audit
    created_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by         VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
    modified_at        TIMESTAMP,
    modified_by        VARCHAR(50),
    deleted_at         TIMESTAMP,
    deleted_by         VARCHAR(50),
    is_deleted         BOOLEAN     NOT NULL DEFAULT FALSE,

    PRIMARY KEY (source_file_hash, source_row_no)
);

CREATE INDEX IF NOT EXISTS ix_ecount_purchase_ledger_raw_date
    ON staging.ecount_purchase_ledger_raw (transaction_date)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_ecount_purchase_ledger_raw_partner
    ON staging.ecount_purchase_ledger_raw (partner_name)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_ecount_purchase_ledger_raw_partner_code
    ON staging.ecount_purchase_ledger_raw (partner_code)
    WHERE is_deleted = FALSE;
