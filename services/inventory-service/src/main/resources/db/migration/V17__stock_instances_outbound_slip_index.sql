-- S3 출고연동: outbound_slip_no 기준 ship/release 대상 조회 인덱스
CREATE INDEX IF NOT EXISTS ix_stock_instances_outbound_slip
    ON stock_instances (outbound_slip_no, product_code, status)
    WHERE outbound_slip_no IS NOT NULL AND is_deleted = FALSE;
