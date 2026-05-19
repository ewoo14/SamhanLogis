-- V12__add_warehouse_ecount_staging.sql
-- MIG-2 이카운트 창고 staging + warehouse lookup map.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE IF NOT EXISTS staging.ecount_warehouse_raw (
    source_file_hash        VARCHAR(64) NOT NULL,
    source_row_no           INT         NOT NULL,
    raw_warehouse_code      TEXT,
    raw_warehouse_name      TEXT,
    raw_warehouse_kind      TEXT,
    raw_process_name        TEXT,
    raw_outsource_partner   TEXT,
    raw_usage_flag          TEXT,
    raw_extra_business      TEXT,
    transform_status        VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    target_warehouse_id     UUID,
    reject_reason           TEXT,
    imported_at             TIMESTAMP   NOT NULL DEFAULT NOW(),
    imported_by             VARCHAR(50) NOT NULL,
    PRIMARY KEY (source_file_hash, source_row_no),
    CONSTRAINT chk_ecount_warehouse_raw_transform_status CHECK (
        transform_status IN ('PENDING', 'IMPORTED', 'UPDATED', 'REJECT_NAME_NULL', 'SKIPPED_PLACEHOLDER')
    )
);

CREATE INDEX IF NOT EXISTS ix_ecount_warehouse_raw_status
    ON staging.ecount_warehouse_raw (transform_status);

CREATE TABLE IF NOT EXISTS staging.ecount_warehouse_map (
    ecount_code       VARCHAR(50) PRIMARY KEY,
    ecount_name       VARCHAR(100),
    warehouse_uuid    UUID        NOT NULL,
    source_file_hash  VARCHAR(64) NOT NULL,
    updated_at        TIMESTAMP   NOT NULL DEFAULT NOW()
);
