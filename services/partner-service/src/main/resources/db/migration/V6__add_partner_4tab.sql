-- V6__add_partner_4tab.sql
-- P0-6 거래처 4탭 UI 보강 — 단가/할인 정책 / 배송지 / 담당자 테이블 신규 추가.
--
-- 컨텍스트:
--   * Phase P0-6 = 거래처 등록/조회 4탭 UI (desktop) 구현 요건.
--   * 기존 Partner entity 에는 단일 주소/연락처만 존재 — 다중 배송지 / 다중 담당자 지원 불가.
--   * 단가/할인 정책 일부는 partners 테이블 열로 이미 존재하나
--     basicDiscountRate / paymentTerm 등 탭 전용 필드를 별도 테이블로 분리.
--
-- 가드:
--   * 신규 테이블 — 기존 partners / partner_attachments / partner_audit_logs IT 영향 0
--   * partners 테이블 FK 미강제 — 물리 삭제 경로 없이 soft-delete 유지
--   * 모든 신규 컬럼 NULLable 또는 default — legacy 호환
--
-- 테이블:
--   1. partner_price_discounts  — 거래처별 단가/할인 정책 (1:1, upsert)
--   2. partner_shipping_addresses — 거래처 배송지 다중 (1:N)
--   3. partner_contacts           — 거래처 담당자 다중 (1:N)

-- ============================================================
-- 1. partner_price_discounts — 단가/할인 정책 (1:1)
-- ============================================================
CREATE TABLE partner_price_discounts (
    id                      UUID         PRIMARY KEY,
    partner_id              UUID         NOT NULL,

    -- 기본 할인율 (0.00 ~ 99.99%)
    basic_discount_rate     NUMERIC(5,2) NOT NULL DEFAULT 0,

    -- 결제 조건 (일수 — 30/45/60/90)
    payment_term_days       INT,

    -- 추가 메모
    discount_memo           VARCHAR(500),

    -- BaseEntity 7 audit
    created_at              TIMESTAMP    NOT NULL,
    created_by              VARCHAR(50)  NOT NULL,
    modified_at             TIMESTAMP,
    modified_by             VARCHAR(50),
    deleted_at              TIMESTAMP,
    deleted_by              VARCHAR(50),
    is_deleted              BOOLEAN      NOT NULL DEFAULT FALSE,

    -- version (낙관적 잠금)
    version                 BIGINT       NOT NULL DEFAULT 0,

    CONSTRAINT uq_partner_price_discounts_partner_id UNIQUE (partner_id)
);

COMMENT ON TABLE partner_price_discounts IS
    'P0-6 거래처 단가/할인 정책 (탭 2) — 거래처 1건당 최대 1행 (UPSERT 패턴)';

COMMENT ON COLUMN partner_price_discounts.partner_id IS
    '대상 거래처 UUID (partners.id). FK 미강제 — soft-delete 후에도 정책 보존';

COMMENT ON COLUMN partner_price_discounts.basic_discount_rate IS
    '기본 할인율 (%). 0.00 ~ 99.99';

COMMENT ON COLUMN partner_price_discounts.payment_term_days IS
    '결제 조건 일수 (예: 30, 45, 60, 90)';

CREATE INDEX ix_partner_price_discounts_partner_id
    ON partner_price_discounts (partner_id)
    WHERE is_deleted = FALSE;

-- ============================================================
-- 2. partner_shipping_addresses — 배송지 다중 (1:N)
-- ============================================================
CREATE TABLE partner_shipping_addresses (
    id              UUID         PRIMARY KEY,
    partner_id      UUID         NOT NULL,

    -- 배송지 별칭 (예: "본사창고", "강남물류센터")
    alias           VARCHAR(100),

    -- 우편번호
    zip_code        VARCHAR(10),

    -- 주소 (전체)
    address         VARCHAR(500) NOT NULL,

    -- 배송지 연락처
    phone           VARCHAR(30),

    -- 수신 담당자명
    receiver_name   VARCHAR(50),

    -- 기본 배송지 여부 (거래처당 1건만 TRUE — service 레이어 보장)
    is_default      BOOLEAN      NOT NULL DEFAULT FALSE,

    -- 비고
    memo            VARCHAR(500),

    -- BaseEntity 7 audit
    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE partner_shipping_addresses IS
    'P0-6 거래처 배송지 다중 (탭 3) — 거래처 1건당 N개 배송지';

COMMENT ON COLUMN partner_shipping_addresses.partner_id IS
    '대상 거래처 UUID (partners.id). FK 미강제';

COMMENT ON COLUMN partner_shipping_addresses.is_default IS
    '기본 배송지 여부. 거래처당 1건만 TRUE — service 레이어에서 이전 기본배송지 FALSE 처리';

CREATE INDEX ix_partner_shipping_addresses_partner_id
    ON partner_shipping_addresses (partner_id)
    WHERE is_deleted = FALSE;

CREATE INDEX ix_partner_shipping_addresses_default
    ON partner_shipping_addresses (partner_id, is_default)
    WHERE is_deleted = FALSE AND is_default = TRUE;

-- ============================================================
-- 3. partner_contacts — 담당자 다중 (1:N)
-- ============================================================
CREATE TABLE partner_contacts (
    id              UUID         PRIMARY KEY,
    partner_id      UUID         NOT NULL,

    -- 담당자명
    contact_name    VARCHAR(50)  NOT NULL,

    -- 직책/직위 (예: "이사", "팀장", "대리")
    position        VARCHAR(50),

    -- 직통 전화
    phone           VARCHAR(30),

    -- 이메일
    email           VARCHAR(120),

    -- 주 담당자 여부 (거래처당 1건만 TRUE — service 레이어 보장)
    is_primary      BOOLEAN      NOT NULL DEFAULT FALSE,

    -- 비고
    memo            VARCHAR(500),

    -- BaseEntity 7 audit
    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE partner_contacts IS
    'P0-6 거래처 담당자 다중 (탭 4) — 거래처 1건당 N명 담당자';

COMMENT ON COLUMN partner_contacts.partner_id IS
    '대상 거래처 UUID (partners.id). FK 미강제';

COMMENT ON COLUMN partner_contacts.is_primary IS
    '주 담당자 여부. 거래처당 1건만 TRUE — service 레이어에서 이전 주담당자 FALSE 처리';

CREATE INDEX ix_partner_contacts_partner_id
    ON partner_contacts (partner_id)
    WHERE is_deleted = FALSE;

CREATE INDEX ix_partner_contacts_primary
    ON partner_contacts (partner_id, is_primary)
    WHERE is_deleted = FALSE AND is_primary = TRUE;
