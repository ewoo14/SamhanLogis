-- V7__add_department_ecount_staging.sql
-- MIG-2 이카운트 부서코드 staging + department lookup map.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE IF NOT EXISTS staging.ecount_department_raw (
    source_file_hash        VARCHAR(64) NOT NULL,
    source_row_no           INT         NOT NULL,
    raw_department_code     TEXT,
    raw_department_name     TEXT,
    raw_usage_flag          TEXT,
    raw_extra_business      TEXT,
    transform_status        VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    target_department_id    UUID,
    reject_reason           TEXT,
    imported_at             TIMESTAMP   NOT NULL DEFAULT NOW(),
    imported_by             VARCHAR(50) NOT NULL,
    PRIMARY KEY (source_file_hash, source_row_no),
    CONSTRAINT chk_ecount_department_raw_transform_status CHECK (
        transform_status IN ('PENDING', 'IMPORTED', 'UPDATED', 'REJECT_NAME_NULL', 'SKIPPED_PLACEHOLDER')
    )
);

CREATE INDEX IF NOT EXISTS ix_ecount_department_raw_status
    ON staging.ecount_department_raw (transform_status);

CREATE TABLE IF NOT EXISTS staging.ecount_department_map (
    ecount_code       VARCHAR(50) PRIMARY KEY,
    ecount_name       VARCHAR(100),
    department_uuid   UUID        NOT NULL,
    source_file_hash  VARCHAR(64) NOT NULL,
    updated_at        TIMESTAMP   NOT NULL DEFAULT NOW()
);
