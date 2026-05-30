-- V29__add_slip_line_source_order_line.sql
-- 부분전환 추적: slip_line 이 어느 주문 라인에서 왔는지 (Phase 2.6a)
ALTER TABLE slip_lines ADD COLUMN source_order_line_id UUID;
COMMENT ON COLUMN slip_lines.source_order_line_id IS '출처 주문 라인 ID (partner-order 부분전환 추적, nullable)';
