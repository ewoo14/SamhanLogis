-- V25__add_ecount_mig5_staging.sql
-- MIG-5 이카운트 지출결의서/입금보고서 raw staging.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE IF NOT EXISTS staging.ecount_expense_voucher_raw (
    source_file_hash VARCHAR(64) NOT NULL,
    source_row_no INT NOT NULL,
    slip_no VARCHAR(50),
    slip_date DATE,
    transaction_type VARCHAR(50),
    amount NUMERIC(15,2),
    partner_name TEXT,
    partner_id UUID,
    partner_code VARCHAR(100),
    description TEXT,
    raw_payload TEXT,
    transform_status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    reject_reason TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(50) NOT NULL,
    modified_at TIMESTAMP NOT NULL DEFAULT NOW(),
    modified_by VARCHAR(50) NOT NULL,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(50),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (source_file_hash, source_row_no)
);

CREATE INDEX IF NOT EXISTS ix_ecount_expense_voucher_raw_partner
    ON staging.ecount_expense_voucher_raw (partner_name);
CREATE INDEX IF NOT EXISTS ix_ecount_expense_voucher_raw_slip
    ON staging.ecount_expense_voucher_raw (slip_no);

CREATE TABLE IF NOT EXISTS staging.ecount_deposit_report_raw (
    source_file_hash VARCHAR(64) NOT NULL,
    source_row_no INT NOT NULL,
    slip_no VARCHAR(50),
    slip_date DATE,
    transaction_type VARCHAR(50),
    amount NUMERIC(15,2),
    partner_name TEXT,
    partner_id UUID,
    partner_code VARCHAR(100),
    description TEXT,
    raw_payload TEXT,
    transform_status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    reject_reason TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(50) NOT NULL,
    modified_at TIMESTAMP NOT NULL DEFAULT NOW(),
    modified_by VARCHAR(50) NOT NULL,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(50),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (source_file_hash, source_row_no)
);

CREATE INDEX IF NOT EXISTS ix_ecount_deposit_report_raw_partner
    ON staging.ecount_deposit_report_raw (partner_name);
CREATE INDEX IF NOT EXISTS ix_ecount_deposit_report_raw_slip
    ON staging.ecount_deposit_report_raw (slip_no);

