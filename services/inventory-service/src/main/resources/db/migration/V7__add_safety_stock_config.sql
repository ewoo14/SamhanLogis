-- V7__add_safety_stock_config.sql
-- P1-3 안전재고 알림 — 제품별 안전재고 임계값 테이블 신규 생성.
--
-- 설계 결정:
--   * (product_id, warehouse_id) 쌍 단위로 임계값 관리.
--     warehouse_id NULL 허용 — 전체 창고 합산 기준 임계값 지원 (NULL = 창고 무관).
--   * safety_stock 컬럼은 NULLable 로 추가 (legacy 호환, 기본 0 default).
--   * partial unique index: (product_id, warehouse_id) WHERE is_deleted = false.
--     warehouse_id NULL 케이스는 COALESCE(warehouse_id, '00000000-0000-0000-0000-000000000000') 사용.

CREATE TABLE safety_stock_configs (
    id              UUID            PRIMARY KEY,
    product_id      UUID            NOT NULL,
    warehouse_id    UUID,                         -- NULL = 전체 창고 합산 기준
    threshold       INT             NOT NULL DEFAULT 0 CHECK (threshold >= 0),
    note            VARCHAR(500),

    -- BaseEntity audit columns
    created_at      TIMESTAMP       NOT NULL,
    created_by      VARCHAR(50)     NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN         NOT NULL DEFAULT FALSE
);

-- warehouse_id NULL 포함 unique 보장: COALESCE trick
CREATE UNIQUE INDEX ux_safety_stock_configs_pw_active
    ON safety_stock_configs (product_id, COALESCE(warehouse_id, '00000000-0000-0000-0000-000000000000'))
    WHERE is_deleted = FALSE;

CREATE INDEX ix_safety_stock_configs_product_active
    ON safety_stock_configs (product_id, is_deleted);
