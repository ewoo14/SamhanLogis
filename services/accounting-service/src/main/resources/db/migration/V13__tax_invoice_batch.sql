-- V13__tax_invoice_batch.sql
-- 세금계산서 일괄발행 배치 + 제외 거래처 마스터 테이블 추가.
-- GAS 계산서일괄등록양식 생성 Notion 저장 대체 → accounting_db RDB 저장.
--
-- 적용 원칙:
--   * 신규 테이블 — ALTER 없음 (legacy 호환 불필요).
--   * 모든 신규 컬럼 NULLable 또는 DEFAULT 제공.
--   * BaseEntity 7 audit 컬럼 포함 (created_at/by / modified_at/by / deleted_at/by / is_deleted).
--   * Soft Delete partial unique INDEX (is_deleted = false).

----------------------------------------------------------------------
-- 1) tax_invoice_batches
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tax_invoice_batches (
    id                      UUID            NOT NULL DEFAULT gen_random_uuid(),
    batch_no                VARCHAR(20)     NOT NULL,
    source_from_date        DATE            NOT NULL,
    source_to_date          DATE            NOT NULL,
    total_row_count         INTEGER         NOT NULL DEFAULT 0,
    split_file_count        INTEGER         NOT NULL DEFAULT 0,
    excluded_slip_nos       TEXT,
    excluded_partner_codes  TEXT,
    data_snapshot_json      TEXT,
    processed_by            UUID,
    processed_at            TIMESTAMP,
    status                  VARCHAR(20)     NOT NULL DEFAULT 'DRAFT',
    version                 BIGINT          NOT NULL DEFAULT 0,

    -- BaseEntity audit
    created_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by              VARCHAR(50)     NOT NULL DEFAULT 'SYSTEM',
    modified_at             TIMESTAMP,
    modified_by             VARCHAR(50),
    deleted_at              TIMESTAMP,
    deleted_by              VARCHAR(50),
    is_deleted              BOOLEAN         NOT NULL DEFAULT FALSE,

    CONSTRAINT pk_tax_invoice_batches PRIMARY KEY (id)
);

-- batch_no 는 active row 기준 unique
CREATE UNIQUE INDEX IF NOT EXISTS uidx_tax_invoice_batches_batch_no_active
    ON tax_invoice_batches (batch_no)
    WHERE is_deleted = FALSE;

-- 이력 조회 성능 인덱스
CREATE INDEX IF NOT EXISTS idx_tax_invoice_batches_processed_at
    ON tax_invoice_batches (processed_at DESC);

CREATE INDEX IF NOT EXISTS idx_tax_invoice_batches_date_range
    ON tax_invoice_batches (source_from_date, source_to_date);

----------------------------------------------------------------------
-- 2) tax_invoice_batch_exclusions
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tax_invoice_batch_exclusions (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    partner_code    VARCHAR(50) NOT NULL,
    partner_name    VARCHAR(100),
    reason          TEXT,

    -- BaseEntity audit
    created_at      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,

    CONSTRAINT pk_tax_invoice_batch_exclusions PRIMARY KEY (id)
);

-- partner_code active row 기준 unique (GAS 제외거래처코드 unique 보장)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_tax_invoice_batch_exclusions_partner_code_active
    ON tax_invoice_batch_exclusions (partner_code)
    WHERE is_deleted = FALSE;
