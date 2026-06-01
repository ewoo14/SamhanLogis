-- V16: S2 입고연동 — 멱등(count 기반 deficit) 조회 효율용 인덱스.
-- (inbound_slip_no, product_id) 로 "이 전표가 이 품목으로 생성한 인스턴스 수" 를 센다. UNIQUE 아님
-- (UUID 인스턴스는 단위별 비즈니스 키가 없어 N행 중복을 제약으로 막지 않고 count 로 수렴).
CREATE INDEX IF NOT EXISTS idx_stock_instances_inbound_slip_product
    ON stock_instances (inbound_slip_no, product_id)
    WHERE is_deleted = FALSE;
