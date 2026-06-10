-- V35__supplier_profile_contact_bank_stamp.sql
-- 사업자 프로필 연락처/인감 컬럼 추가 + 은행계좌 테이블 신설.
-- spec §1a — 2026-06-10
--
-- 적용 원칙:
--   * 신규 컬럼 전부 NULLable (legacy 호환 — 기존 row 무중단).
--   * BaseEntity 7 audit 컬럼 패턴 = V14 동일.
--   * 계좌 실데이터 seed 절대 금지 (public repo).
--   * stamp_png BYTEA — @Lob 금지 (Hibernate 6 oid mismatch 회피, Slip.java:263 NOTE 동일).

----------------------------------------------------------------------
-- 1) supplier_profiles 컬럼 추가
----------------------------------------------------------------------
ALTER TABLE supplier_profiles
    ADD COLUMN IF NOT EXISTS tel        VARCHAR(30),
    ADD COLUMN IF NOT EXISTS fax        VARCHAR(30),
    ADD COLUMN IF NOT EXISTS stamp_png  BYTEA,
    ADD COLUMN IF NOT EXISTS stamp_hash VARCHAR(64);

-- 기존 primary seed row 에 현행 인쇄 표기값 backfill (운영 UI 에서 정정 가능)
UPDATE supplier_profiles
   SET tel = '02-3461-0000',
       fax = '02-3461-0001'
 WHERE is_primary = TRUE
   AND is_deleted = FALSE
   AND tel IS NULL;

----------------------------------------------------------------------
-- 2) supplier_bank_accounts — 신규 테이블
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_bank_accounts (
    id                  UUID         NOT NULL DEFAULT gen_random_uuid(),
    supplier_profile_id UUID         NOT NULL REFERENCES supplier_profiles (id),
    account_holder      VARCHAR(50)  NOT NULL,   -- 예금주
    bank_name           VARCHAR(50)  NOT NULL,   -- 은행명
    account_number      VARCHAR(50)  NOT NULL,   -- 계좌번호
    display_order       INT          NOT NULL DEFAULT 0,

    -- BaseEntity 7 audit (V14 패턴 동일)
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by  VARCHAR(50)  NOT NULL DEFAULT 'SYSTEM',
    modified_at TIMESTAMP,
    modified_by VARCHAR(50),
    deleted_at  TIMESTAMP,
    deleted_by  VARCHAR(50),
    is_deleted  BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT pk_supplier_bank_accounts PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_bank_profile_active
    ON supplier_bank_accounts (supplier_profile_id, display_order)
    WHERE is_deleted = FALSE;
