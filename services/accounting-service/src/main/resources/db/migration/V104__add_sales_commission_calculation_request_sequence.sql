ALTER TABLE sales_commission_settlements
    ADD COLUMN last_calculation_request_sequence BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN sales_commission_settlements.last_calculation_request_sequence IS
    '화면 자동저장 요청의 최신 client sequence';
