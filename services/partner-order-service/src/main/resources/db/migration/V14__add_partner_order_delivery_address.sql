-- Issue #1001 슬라이스 2 — 거래처 주문의 구조화 배송주소 snapshot.
-- 기존 주문은 출처가 없으므로 NULL을 유지한다. backfill 하지 않는다.
ALTER TABLE partner_orders
    ADD COLUMN delivery_address VARCHAR(500);

COMMENT ON COLUMN partner_orders.delivery_address IS
    '구조화된 실제 배송주소 snapshot. shipping_address/거래처 주소/적요 대체 금지.';
