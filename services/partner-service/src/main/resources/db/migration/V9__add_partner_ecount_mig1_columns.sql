-- V9__add_partner_ecount_mig1_columns.sql
-- MIG-1 PoC — 이카운트 거래처 17 컬럼 CSV 적재 위한 partners 3 신규 컬럼 + staging.ecount_partner_raw.
-- spec: docs/superpowers/specs/2026-05-19-ecount-mig-1-partner-design.md (D-MIG-1-07)
--
-- 가드:
--   - 신규 3 컬럼 모두 NULLable (legacy data 호환)
--   - staging 스키마 별도 (도메인 schema 와 분리)
--   - (source_file_hash, source_row_no) 복합 PK 로 멱등 적재

-- ============================================================
-- 1) partners 3 신규 컬럼 — 이카운트 17 컬럼 매핑 보강
-- ============================================================
ALTER TABLE partners
    ADD COLUMN transfer_info VARCHAR(20),     -- 이체정보 ("등록" / NULL) — 이카운트 export 컬럼 13
    ADD COLUMN note          TEXT,            -- 특이사항 (자유 메모) — 이카운트 export 컬럼 10
    ADD COLUMN manager_name  VARCHAR(50);     -- 담당자명 (이성미/장영구/김미선 등) — 이카운트 export 컬럼 2

CREATE INDEX ix_partners_manager_name ON partners (manager_name)
    WHERE is_deleted = FALSE AND manager_name IS NOT NULL;

-- ============================================================
-- 2) staging 스키마 — 마이그레이션 raw 저장소
-- ============================================================
CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE staging.ecount_partner_raw (
    source_file_hash    VARCHAR(64) NOT NULL,    -- SHA-256 hex (대문자 32 byte)
    source_row_no       INT         NOT NULL,    -- 3 이상 (1=메타, 2=헤더, 3+=데이터)

    -- 17 raw text 컬럼 (이카운트 헤더 순서 그대로, 모두 NULLable text — staging 책임 = "원본 보존")
    raw_partner_code    TEXT,
    raw_registration    TEXT,
    raw_manager_name    TEXT,
    raw_sub_biz_no      TEXT,
    raw_name            TEXT,
    raw_representative  TEXT,
    raw_address1        TEXT,
    raw_phone           TEXT,
    raw_mobile          TEXT,
    raw_search_keyword  TEXT,
    raw_note            TEXT,
    raw_partner_group1  TEXT,
    raw_usage_flag      TEXT,
    raw_transfer_info   TEXT,
    raw_credit_limit    TEXT,
    raw_first_created   TEXT,

    -- transform 결과 분류 (멱등 재실행 시 UPDATE)
    transform_status    VARCHAR(30) NOT NULL DEFAULT 'PENDING',  -- IMPORTED / UPDATED / REJECT_NAME_NULL / SKIPPED_PLACEHOLDER
    target_partner_id   UUID,                                     -- transform 성공 시 채움
    reject_reason       TEXT,                                     -- 분류 사유 (사용자 검토용)

    imported_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    imported_by         VARCHAR(50) NOT NULL,                     -- actor user id (X-User-Id)

    PRIMARY KEY (source_file_hash, source_row_no),

    CONSTRAINT chk_ecount_partner_raw_transform_status CHECK (
        transform_status IN ('PENDING', 'IMPORTED', 'UPDATED', 'REJECT_NAME_NULL', 'SKIPPED_PLACEHOLDER')
    )
);

CREATE INDEX ix_ecount_partner_raw_status
    ON staging.ecount_partner_raw (transform_status);

CREATE INDEX ix_ecount_partner_raw_partner_id
    ON staging.ecount_partner_raw (target_partner_id)
    WHERE target_partner_id IS NOT NULL;

CREATE INDEX ix_ecount_partner_raw_imported_at
    ON staging.ecount_partner_raw (imported_at DESC);

COMMENT ON SCHEMA staging IS '마이그레이션 staging — 외부 ERP raw 데이터 보존 (이카운트 / 향후 추가 ERP 동일 패턴)';
COMMENT ON TABLE staging.ecount_partner_raw IS '이카운트 거래처 CSV 17 컬럼 raw + transform 결과 분류 (멱등 적재용)';
COMMENT ON COLUMN staging.ecount_partner_raw.source_file_hash IS 'SHA-256(파일 첫 1KB || 파일 size) — 멱등 키 1';
COMMENT ON COLUMN staging.ecount_partner_raw.source_row_no IS 'CSV 1-base row number (1=메타, 2=헤더) — 멱등 키 2';
COMMENT ON COLUMN staging.ecount_partner_raw.transform_status IS 'IMPORTED=신규 / UPDATED=기존 갱신 / REJECT_NAME_NULL=거래처명 누락 / SKIPPED_PLACEHOLDER=거래처코드 가짜값';
