-- V15: 개별시리얼 재고 인스턴스 (Phase INV-S / S1). UUID = 인스턴스 시리얼 키.
-- serial_managed 카테고리(에어컨/판넬) 품목만 해당. batch 품목은 기존 stock_lots 유지(무변경).
CREATE TABLE stock_instances (
    id                    UUID PRIMARY KEY,
    product_id            UUID NOT NULL,
    product_code          VARCHAR(50) NOT NULL,
    warehouse_id          UUID NOT NULL,
    status                VARCHAR(20) NOT NULL,         -- AVAILABLE/RESERVED/SHIPPED/RECALLED
    inbound_type          VARCHAR(20),                  -- 구매/차용
    received_at           TIMESTAMP NOT NULL,           -- FIFO 정렬 키
    unit_cost             NUMERIC(15,2),
    inbound_slip_no       VARCHAR(64),
    outbound_partner_code VARCHAR(100),                 -- 회수 역-FIFO 근거
    outbound_slip_no      VARCHAR(64),
    outbound_at           TIMESTAMP,
    created_at            TIMESTAMP NOT NULL,
    created_by            VARCHAR(50) NOT NULL,
    modified_at           TIMESTAMP,
    modified_by           VARCHAR(50),
    deleted_at            TIMESTAMP,
    deleted_by            VARCHAR(50),
    is_deleted            BOOLEAN NOT NULL DEFAULT FALSE
);
-- FIFO 소진: product_code + status + received_at ASC
CREATE INDEX ix_stock_instances_fifo ON stock_instances(product_code, status, received_at);
-- 역-FIFO 회수: outbound_partner_code + product_code + status + outbound_at DESC
CREATE INDEX ix_stock_instances_recall ON stock_instances(outbound_partner_code, product_code, status, outbound_at);
CREATE INDEX ix_stock_instances_product ON stock_instances(product_id);
COMMENT ON TABLE stock_instances IS '개별시리얼 재고 인스턴스 — UUID=시리얼 키 (Phase INV-S S1)';
COMMENT ON COLUMN stock_instances.status IS 'AVAILABLE/RESERVED/SHIPPED/RECALLED — soft delete 대신 status 전이';
COMMENT ON COLUMN stock_instances.received_at IS '입고일시 — FIFO 정렬 키';
COMMENT ON COLUMN stock_instances.outbound_partner_code IS '출고 거래처 코드 — 회수 역-FIFO 근거';
