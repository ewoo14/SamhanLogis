-- V23__add_ecount_voucher_staging.sql
-- MIG-3 이카운트 회계 전표 4종 raw staging.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE IF NOT EXISTS staging.ecount_purchase_slip_raw (
    source_file_hash   VARCHAR(64) NOT NULL,
    source_row_no      INT         NOT NULL,
    slip_no            VARCHAR(50),
    transaction_date   DATE,
    transaction_type   TEXT,
    amount             NUMERIC(15,2),
    partner_name       TEXT,
    description        TEXT,
    raw_payload        TEXT,
    transform_status   VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    target_slip_no     VARCHAR(50),
    reject_reason      TEXT,
    imported_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
    imported_by        VARCHAR(50) NOT NULL,
    PRIMARY KEY (source_file_hash, source_row_no)
);

CREATE INDEX IF NOT EXISTS ix_ecount_purchase_raw_date
    ON staging.ecount_purchase_slip_raw (transaction_date);
CREATE INDEX IF NOT EXISTS ix_ecount_purchase_raw_partner
    ON staging.ecount_purchase_slip_raw (partner_name);
CREATE INDEX IF NOT EXISTS ix_ecount_purchase_raw_slip
    ON staging.ecount_purchase_slip_raw (slip_no);

CREATE TABLE IF NOT EXISTS staging.ecount_sales_slip_raw (
    source_file_hash   VARCHAR(64) NOT NULL,
    source_row_no      INT         NOT NULL,
    slip_no            VARCHAR(50),
    transaction_date   DATE,
    transaction_type   TEXT,
    amount             NUMERIC(15,2),
    partner_name       TEXT,
    description        TEXT,
    raw_payload        TEXT,
    transform_status   VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    target_slip_no     VARCHAR(50),
    reject_reason      TEXT,
    imported_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
    imported_by        VARCHAR(50) NOT NULL,
    PRIMARY KEY (source_file_hash, source_row_no)
);

CREATE INDEX IF NOT EXISTS ix_ecount_sales_raw_date
    ON staging.ecount_sales_slip_raw (transaction_date);
CREATE INDEX IF NOT EXISTS ix_ecount_sales_raw_partner
    ON staging.ecount_sales_slip_raw (partner_name);
CREATE INDEX IF NOT EXISTS ix_ecount_sales_raw_slip
    ON staging.ecount_sales_slip_raw (slip_no);

CREATE TABLE IF NOT EXISTS staging.ecount_general_voucher_raw (
    source_file_hash   VARCHAR(64) NOT NULL,
    source_row_no      INT         NOT NULL,
    journal_no         VARCHAR(20),
    transaction_date   DATE,
    transaction_type   TEXT,
    amount             NUMERIC(15,2),
    partner_name       TEXT,
    description        TEXT,
    raw_payload        TEXT,
    transform_status   VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    target_journal_no  VARCHAR(20),
    reject_reason      TEXT,
    imported_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
    imported_by        VARCHAR(50) NOT NULL,
    PRIMARY KEY (source_file_hash, source_row_no)
);

CREATE INDEX IF NOT EXISTS ix_ecount_general_raw_date
    ON staging.ecount_general_voucher_raw (transaction_date);
CREATE INDEX IF NOT EXISTS ix_ecount_general_raw_partner
    ON staging.ecount_general_voucher_raw (partner_name);
CREATE INDEX IF NOT EXISTS ix_ecount_general_raw_journal
    ON staging.ecount_general_voucher_raw (journal_no);

CREATE TABLE IF NOT EXISTS staging.ecount_journal_entry_raw (
    source_file_hash   VARCHAR(64) NOT NULL,
    source_row_no      INT         NOT NULL,
    journal_no         VARCHAR(20),
    transaction_date   DATE,
    line_sequence      INT,
    account_name       TEXT,
    partner_name       TEXT,
    debit_amount       NUMERIC(15,2),
    credit_amount      NUMERIC(15,2),
    description        TEXT,
    raw_payload        TEXT,
    transform_status   VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    target_journal_no  VARCHAR(20),
    reject_reason      TEXT,
    imported_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
    imported_by        VARCHAR(50) NOT NULL,
    PRIMARY KEY (source_file_hash, source_row_no)
);

CREATE INDEX IF NOT EXISTS ix_ecount_journal_entry_raw_date
    ON staging.ecount_journal_entry_raw (transaction_date);
CREATE INDEX IF NOT EXISTS ix_ecount_journal_entry_raw_journal
    ON staging.ecount_journal_entry_raw (journal_no);
CREATE INDEX IF NOT EXISTS ix_ecount_journal_entry_raw_account
    ON staging.ecount_journal_entry_raw (account_name);
CREATE INDEX IF NOT EXISTS ix_ecount_journal_entry_raw_partner
    ON staging.ecount_journal_entry_raw (partner_name);

CREATE UNIQUE INDEX IF NOT EXISTS ux_journal_lines_journal_line
    ON journal_lines (journal_id, line_no);
