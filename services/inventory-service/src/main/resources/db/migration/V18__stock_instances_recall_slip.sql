-- S4 회수연동: recall_slip_no 멱등 마커 + 조회 인덱스
ALTER TABLE stock_instances
    ADD COLUMN IF NOT EXISTS recall_slip_no VARCHAR(64);

CREATE INDEX IF NOT EXISTS ix_stock_instances_recall_slip
    ON stock_instances (recall_slip_no, product_code, status)
    WHERE recall_slip_no IS NOT NULL AND is_deleted = FALSE;

COMMENT ON COLUMN stock_instances.recall_slip_no IS '회수(반품/회차) 입고전표 번호 — S4 멱등 마커';
