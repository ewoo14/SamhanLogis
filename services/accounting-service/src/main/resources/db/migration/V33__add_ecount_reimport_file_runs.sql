-- V33__add_ecount_reimport_file_runs.sql
-- MIG-20 raw 재import 실행 단위 멱등 기록.

CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE IF NOT EXISTS staging.ecount_reimport_file_runs (
    slice_code       VARCHAR(20)  NOT NULL,
    target_key       VARCHAR(80)  NOT NULL,
    source_file_hash VARCHAR(64)  NOT NULL,
    file_name        VARCHAR(255) NOT NULL,
    imported_count   INTEGER      NOT NULL DEFAULT 0,
    rejected_count   INTEGER      NOT NULL DEFAULT 0,
    processed_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    processed_by     VARCHAR(80)  NOT NULL DEFAULT 'system',
    PRIMARY KEY (slice_code, target_key, source_file_hash)
);

CREATE INDEX IF NOT EXISTS idx_ecount_reimport_file_runs_hash
    ON staging.ecount_reimport_file_runs (source_file_hash);
