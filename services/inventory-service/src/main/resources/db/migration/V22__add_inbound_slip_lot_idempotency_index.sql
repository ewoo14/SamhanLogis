-- V22: 입고검수/전표 라이프사이클 교차 입고 멱등성
-- 동일 입고전표번호·품목·창고·라인은 두 경로에서 하나의 lot만 가질 수 있다.
-- 임의 외부 lot 번호의 기존 재사용 계약은 건드리지 않고, 전표번호 형식만 대상으로 한다.
ALTER TABLE stock_lots ADD COLUMN IF NOT EXISTS inbound_line_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_lots_inbound_slip_idempotency
    ON stock_lots (product_id, warehouse_id, lot_no, inbound_line_id)
    WHERE is_deleted = FALSE
      AND source_transfer_id IS NULL
      AND lot_no IS NOT NULL
      AND inbound_line_id IS NOT NULL
      AND lot_no ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}-[0-9]+$';
