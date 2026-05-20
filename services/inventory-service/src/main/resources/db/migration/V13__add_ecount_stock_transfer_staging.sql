-- V13__add_ecount_stock_transfer_staging.sql
-- MIG-5 이카운트 창고이동 raw staging.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE IF NOT EXISTS staging.ecount_stock_transfer_raw (
    source_file_hash VARCHAR(64) NOT NULL,
    source_row_no INT NOT NULL,
    transfer_no VARCHAR(50),
    transfer_date DATE,
    source_warehouse_name TEXT,
    destination_warehouse_name TEXT,
    item_name TEXT,
    quantity INT,
    amount NUMERIC(15,2),
    memo TEXT,
    raw_payload TEXT,
    transform_status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    target_transfer_no VARCHAR(50),
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

CREATE INDEX IF NOT EXISTS ix_ecount_stock_transfer_raw_transfer_no
    ON staging.ecount_stock_transfer_raw (transfer_no);

CREATE INDEX IF NOT EXISTS ix_ecount_stock_transfer_raw_source_warehouse
    ON staging.ecount_stock_transfer_raw (source_warehouse_name);

