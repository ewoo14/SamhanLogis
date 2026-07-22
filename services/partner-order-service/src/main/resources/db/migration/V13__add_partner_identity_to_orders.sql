-- V13__add_partner_identity_to_orders.sql
-- S7 도달가능 3: 표시용 partner_code와 거래처 정체성 UUID를 분리한다.
-- 기존 주문은 partner-service DB의 과거 시점 매핑을 이 DB에서 알 수 없으므로 자동 backfill하지 않는다.
-- NULL partner_id = legacy identity 미해결. 병합 서비스가 명시적으로 409 거부한다.

ALTER TABLE partner_orders
    ADD COLUMN partner_id UUID;

CREATE INDEX ix_partner_orders_partner_id_active
    ON partner_orders (partner_id, is_deleted);

COMMENT ON COLUMN partner_orders.partner_id IS
    '거래처 내부 UUID snapshot. NULL은 legacy 행의 정체성 미해결 상태이며 병합 금지.';
