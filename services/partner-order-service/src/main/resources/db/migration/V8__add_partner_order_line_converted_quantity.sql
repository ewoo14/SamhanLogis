-- V8__add_partner_order_line_converted_quantity.sql
-- 부분전환 추적: 라인별 전환된 수량 (Phase 2.6a). 잔여 = quantity - converted_quantity
ALTER TABLE partner_order_lines ADD COLUMN converted_quantity INT NOT NULL DEFAULT 0;
COMMENT ON COLUMN partner_order_lines.converted_quantity IS '출고전표로 전환된 누적 수량 (부분전환, Phase 2.6a)';
