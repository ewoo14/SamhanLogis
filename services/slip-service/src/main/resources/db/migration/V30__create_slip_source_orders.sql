-- V30: 다중 주문 → 단일 출고전표 병합 N:1 출처추적 (Phase 2.6b D2)
-- 단일주문 전환은 slip.source_id 그대로 사용하며 이 테이블에 기록하지 않는다(회귀 0).
-- BaseEntity 컬럼 정의: created_by VARCHAR(50) NOT NULL / modified_by|deleted_by VARCHAR(50) nullable
-- (cf. BaseEntity @Column(nullable=false, length=50) / modified_by @Column(length=50) / deleted_by @Column(length=50))
CREATE TABLE slip_source_orders (
    id               UUID PRIMARY KEY,
    slip_id          UUID NOT NULL REFERENCES slips(id),
    partner_order_id UUID NOT NULL,
    order_no         VARCHAR(64) NOT NULL,
    created_at       TIMESTAMP NOT NULL,
    created_by       VARCHAR(50) NOT NULL,
    modified_at      TIMESTAMP,
    modified_by      VARCHAR(50),
    deleted_at       TIMESTAMP,
    deleted_by       VARCHAR(50),
    is_deleted       BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX ix_slip_source_orders_slip  ON slip_source_orders(slip_id);
CREATE INDEX ix_slip_source_orders_order ON slip_source_orders(partner_order_id);

COMMENT ON TABLE slip_source_orders IS '병합 발행 전표의 출처 주문 N:1 추적 (Phase 2.6b D2)';
