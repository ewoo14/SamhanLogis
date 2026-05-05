-- V1__init_dc_config.sql
-- Phase 6 M3 — dc-config-service initial schema (4 entity).
--
-- BaseEntity audit columns: created_at / created_by / modified_at / modified_by
--                           / deleted_at / deleted_by / is_deleted (NOT NULL DEFAULT FALSE)
-- Soft-delete 는 application-side @SQLRestriction("is_deleted = false") 로 강제.
--
-- DC 노출 5겹 가드: DB schema 자체는 가드 책임 없음. Controller 분리 + DTO 분리 + Gateway 차단
--                   + IT assertion + internal token 의 5겹은 application/infra 레이어 책임.

-- ============================================================
-- 1) partners — 거래처 마스터 (옵션 A: M3 owner)
-- ============================================================
CREATE TABLE partners (
    id              UUID         PRIMARY KEY,
    partner_code    VARCHAR(64)  NOT NULL,
    biz_no          VARCHAR(20),
    name            VARCHAR(150) NOT NULL,
    address         VARCHAR(500),
    phone           VARCHAR(30),
    manager         VARCHAR(50),
    partner_group   VARCHAR(30)  NOT NULL DEFAULT 'UNCLASSIFIED',
    credit_limit    NUMERIC(15,2) CHECK (credit_limit IS NULL OR credit_limit >= 0),
    remark          TEXT,

    -- BaseEntity audit columns
    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX ux_partners_code_active
    ON partners (partner_code)
    WHERE is_deleted = FALSE;

CREATE INDEX ix_partners_biz_no
    ON partners (biz_no)
    WHERE is_deleted = FALSE AND biz_no IS NOT NULL;

CREATE INDEX ix_partners_group
    ON partners (partner_group, is_deleted);

-- ============================================================
-- 2) dc_configs — 거래처별 DC 설정 (Partner 1:1)
-- ============================================================
CREATE TABLE dc_configs (
    id                            UUID          PRIMARY KEY,
    partner_id                    UUID          NOT NULL REFERENCES partners(id),
    home_discount_rate            NUMERIC(5,4)  CHECK (home_discount_rate IS NULL OR (home_discount_rate >= 0 AND home_discount_rate < 1)),
    commercial_discount_rate      NUMERIC(5,4)  CHECK (commercial_discount_rate IS NULL OR (commercial_discount_rate >= 0 AND commercial_discount_rate < 1)),
    show_i_hose                   BOOLEAN       NOT NULL DEFAULT FALSE,
    discount_360_amount           NUMERIC(12,2) CHECK (discount_360_amount IS NULL OR discount_360_amount >= 0),
    discount_4way_amount          NUMERIC(12,2) CHECK (discount_4way_amount IS NULL OR discount_4way_amount >= 0),
    discount_1way_amount          NUMERIC(12,2) CHECK (discount_1way_amount IS NULL OR discount_1way_amount >= 0),
    discount_stand_amount         NUMERIC(12,2) CHECK (discount_stand_amount IS NULL OR discount_stand_amount >= 0),
    discount_deluxe_amount        NUMERIC(12,2) CHECK (discount_deluxe_amount IS NULL OR discount_deluxe_amount >= 0),
    discount_first_grade_amount   NUMERIC(12,2) CHECK (discount_first_grade_amount IS NULL OR discount_first_grade_amount >= 0),
    unit_round_to                 INT           CHECK (unit_round_to IS NULL OR unit_round_to >= 0),
    unit_round_mode               VARCHAR(10)   NOT NULL DEFAULT 'ROUND',
    source                        VARCHAR(20)   NOT NULL DEFAULT 'ADMIN_EDIT',
    note                          TEXT,

    -- BaseEntity audit columns
    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX ux_dc_configs_partner_active
    ON dc_configs (partner_id)
    WHERE is_deleted = FALSE;

-- ============================================================
-- 3) dc_rules — 카테고리/모델 prefix 단위 룰 (확장)
-- ============================================================
CREATE TABLE dc_rules (
    id                      UUID          PRIMARY KEY,
    partner_id              UUID          REFERENCES partners(id),  -- NULL = GLOBAL
    rule_type               VARCHAR(20)   NOT NULL,
    model_prefix_pattern    VARCHAR(64),
    category_code           VARCHAR(30),
    discount_rate           NUMERIC(5,4)  CHECK (discount_rate IS NULL OR (discount_rate >= 0 AND discount_rate < 1)),
    discount_amount         NUMERIC(12,2) CHECK (discount_amount IS NULL OR discount_amount >= 0),
    priority                INT           NOT NULL DEFAULT 100,
    effective_from          DATE,
    effective_to            DATE,
    note                    TEXT,

    -- BaseEntity audit columns
    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT chk_dc_rules_effective_range
        CHECK (effective_from IS NULL OR effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX ix_dc_rules_partner_priority
    ON dc_rules (partner_id, priority, is_deleted);

CREATE INDEX ix_dc_rules_global_priority
    ON dc_rules (priority, is_deleted)
    WHERE partner_id IS NULL;

CREATE INDEX ix_dc_rules_model_prefix
    ON dc_rules (model_prefix_pattern)
    WHERE model_prefix_pattern IS NOT NULL AND is_deleted = FALSE;

-- ============================================================
-- 4) price_calculation_logs — 감사 로그 (jsonb)
-- ============================================================
CREATE TABLE price_calculation_logs (
    id                      UUID         PRIMARY KEY,
    partner_id              UUID,
    caller_service          VARCHAR(50)  NOT NULL,
    request_payload         JSONB,
    response_payload        JSONB,
    applied_dc_snapshot     JSONB,
    total_list_amount       NUMERIC(15,2),
    total_final_amount      NUMERIC(15,2),
    total_discount_amount   NUMERIC(15,2),

    -- BaseEntity audit columns
    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX ix_price_logs_partner_created
    ON price_calculation_logs (partner_id, created_at DESC);

CREATE INDEX ix_price_logs_caller_created
    ON price_calculation_logs (caller_service, created_at DESC);

CREATE INDEX gin_price_logs_request
    ON price_calculation_logs USING gin (request_payload jsonb_path_ops);
