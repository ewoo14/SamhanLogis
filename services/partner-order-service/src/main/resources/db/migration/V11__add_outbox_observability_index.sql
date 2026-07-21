-- #863 outbox 관측 pull 쿼리용 부분 인덱스.
-- count(depth)는 index-only scan 후보가 되고, oldest age의 MIN(first_attempted_at)은
-- 상태별 첫 인덱스 항목부터 읽을 수 있다. is_deleted=false + PENDING/PROCESSING만 포함한다.
CREATE INDEX ix_slip_publish_outbox_pending_first_attempted
    ON slip_publish_outbox (status, first_attempted_at)
    WHERE is_deleted = FALSE
      AND status IN ('PENDING', 'PROCESSING');
