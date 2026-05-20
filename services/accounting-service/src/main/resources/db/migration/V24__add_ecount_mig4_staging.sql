-- V24__add_ecount_mig4_staging.sql
-- MIG-4 이카운트 영업·세무 raw 4종 staging + SalesAccountingSlip 입금예정일 보강.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS staging;

ALTER TABLE sales_accounting_slips
    ADD COLUMN IF NOT EXISTS due_date DATE NULL;

CREATE TABLE IF NOT EXISTS staging.ecount_tax_invoice_raw (
    source_file_hash VARCHAR(64) NOT NULL,
    source_row_no INT NOT NULL,
    partner_code VARCHAR(100),
    biz_subno VARCHAR(50),
    partner_name TEXT,
    representative TEXT,
    address TEXT,
    biz_type TEXT,
    biz_item TEXT,
    email TEXT,
    supply_amount NUMERIC(15,2),
    vat_amount NUMERIC(15,2),
    issue_date DATE,
    item_name TEXT,
    quantity NUMERIC(15,3),
    unit_price NUMERIC(15,2),
    related_slip_no VARCHAR(50),
    raw_payload TEXT,
    transform_status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    target_tax_invoice_no VARCHAR(50),
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

CREATE INDEX IF NOT EXISTS ix_ecount_tax_invoice_raw_partner
    ON staging.ecount_tax_invoice_raw (partner_name);
CREATE INDEX IF NOT EXISTS ix_ecount_tax_invoice_raw_issue_date
    ON staging.ecount_tax_invoice_raw (issue_date);

CREATE TABLE IF NOT EXISTS staging.ecount_sales_slip_line_raw (
    source_file_hash VARCHAR(64) NOT NULL,
    source_row_no INT NOT NULL,
    slip_no VARCHAR(50),
    legacy_slip_no VARCHAR(50),
    slip_date DATE,
    partner_code VARCHAR(100),
    partner_name TEXT,
    item_name TEXT,
    quantity NUMERIC(15,3),
    unit_price NUMERIC(15,2),
    supply_amount NUMERIC(15,2),
    vat_amount NUMERIC(15,2),
    total_amount NUMERIC(15,2),
    due_date DATE,
    raw_payload TEXT,
    transform_status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    target_slip_no VARCHAR(50),
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

CREATE INDEX IF NOT EXISTS ix_ecount_sales_slip_line_raw_partner
    ON staging.ecount_sales_slip_line_raw (partner_name);
CREATE INDEX IF NOT EXISTS ix_ecount_sales_slip_line_raw_slip
    ON staging.ecount_sales_slip_line_raw (slip_no);

CREATE TABLE IF NOT EXISTS staging.ecount_sales_purchase_summary_raw (
    source_file_hash VARCHAR(64) NOT NULL,
    source_row_no INT NOT NULL,
    month_day VARCHAR(50),
    summary_date DATE,
    type_name TEXT,
    electronic_type TEXT,
    partner_name TEXT,
    detail TEXT,
    purchase_supply NUMERIC(15,2),
    purchase_vat NUMERIC(15,2),
    sales_supply NUMERIC(15,2),
    sales_vat NUMERIC(15,2),
    sales_total NUMERIC(15,2),
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

CREATE INDEX IF NOT EXISTS ix_ecount_sales_purchase_summary_raw_partner
    ON staging.ecount_sales_purchase_summary_raw (partner_name);
CREATE INDEX IF NOT EXISTS ix_ecount_sales_purchase_summary_raw_date
    ON staging.ecount_sales_purchase_summary_raw (summary_date);

CREATE TABLE IF NOT EXISTS staging.ecount_order_raw (
    source_file_hash VARCHAR(64) NOT NULL,
    source_row_no INT NOT NULL,
    order_no VARCHAR(50),
    legacy_order_no VARCHAR(50),
    order_date DATE,
    partner_name TEXT,
    manager_name TEXT,
    valid_until TEXT,
    payment_terms TEXT,
    reference TEXT,
    progress_status VARCHAR(20),
    item_name TEXT,
    quantity NUMERIC(15,3),
    unit_price NUMERIC(15,2),
    supply_amount NUMERIC(15,2),
    vat_amount NUMERIC(15,2),
    item_due_date DATE,
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

CREATE INDEX IF NOT EXISTS ix_ecount_order_raw_partner
    ON staging.ecount_order_raw (partner_name);
CREATE INDEX IF NOT EXISTS ix_ecount_order_raw_order
    ON staging.ecount_order_raw (order_no);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tax_invoice_lines_invoice_line
    ON tax_invoice_lines (tax_invoice_id, line_no);
