-- V14__supplier_profile.sql
-- 사업자 프로필 테이블 + 기본값 seed.
-- GAS Code.js / Index.html 하드코딩 공급자 정보 → DB 기반 전환.
--
-- 적용 원칙:
--   * 신규 테이블 — ALTER 없음 (legacy 호환 불필요).
--   * 모든 신규 컬럼 NULLable 또는 DEFAULT 제공.
--   * BaseEntity 7 audit 컬럼 포함 (created_at/by / modified_at/by / deleted_at/by / is_deleted).
--   * Soft Delete partial unique INDEX (is_deleted = false).

----------------------------------------------------------------------
-- 1) supplier_profiles
----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_profiles (
    id                      UUID            NOT NULL DEFAULT gen_random_uuid(),
    business_number         VARCHAR(10)     NOT NULL,
    sub_business_number     VARCHAR(4),
    company_name            VARCHAR(100)    NOT NULL,
    representative_name     VARCHAR(50)     NOT NULL,
    business_address        VARCHAR(500)    NOT NULL,
    business_type           VARCHAR(50),
    business_item           VARCHAR(50),
    email                   VARCHAR(100),
    is_primary              BOOLEAN         NOT NULL DEFAULT false,
    version                 BIGINT          NOT NULL DEFAULT 0,

    -- BaseEntity 7 audit
    created_at              TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by              VARCHAR(50)     NOT NULL DEFAULT 'SYSTEM',
    modified_at             TIMESTAMP,
    modified_by             VARCHAR(50),
    deleted_at              TIMESTAMP,
    deleted_by              VARCHAR(50),
    is_deleted              BOOLEAN         NOT NULL DEFAULT FALSE,

    CONSTRAINT pk_supplier_profiles PRIMARY KEY (id)
);

-- active row 기준 business_number unique
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_business_number_active
    ON supplier_profiles (business_number)
    WHERE is_deleted = FALSE;

-- is_primary=true 인 active row 는 단 1건만 허용
-- PostgreSQL partial unique index: WHERE 절로 true+active 조합 보장
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_primary_active
    ON supplier_profiles (is_primary)
    WHERE is_primary = TRUE AND is_deleted = FALSE;

----------------------------------------------------------------------
-- 2) seed — GAS 하드코딩 기본값 삽입
----------------------------------------------------------------------
INSERT INTO supplier_profiles (
    id,
    business_number,
    sub_business_number,
    company_name,
    representative_name,
    business_address,
    business_type,
    business_item,
    email,
    is_primary,
    version,
    created_at,
    created_by,
    is_deleted
)
VALUES (
    gen_random_uuid(),
    '2148720659',
    NULL,
    '（주）삼한공조시스템',
    '김미선',
    '서울특별시 서초구 마방로2길 9, 4층(양재동)',
    '도소매',
    '가전제품',
    'apjog09@daum.net',
    TRUE,
    0,
    CURRENT_TIMESTAMP,
    'SYSTEM',
    FALSE
);
