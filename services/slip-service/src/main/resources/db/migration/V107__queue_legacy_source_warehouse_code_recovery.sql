-- S16: V102가 제외했던 기존 OUTBOUND 전표 중 창고 code 미확정 행을 회복 큐로 승계한다.
-- inventory 조회 결과가 상일·초월이면 가배차 모드에 들어가고, 그 외 창고면 UNKNOWN으로
-- 남는다. 신규 전표의 after-commit 경로와 동일한 PENDING worker를 사용한다.
UPDATE slips
   SET source_warehouse_code_pending = TRUE,
       source_warehouse_code_snapshot_status = 'PENDING',
       source_warehouse_code_next_attempt_at = CURRENT_TIMESTAMP,
       source_warehouse_code_claimed_at = NULL,
       source_warehouse_code_claim_token = NULL,
       source_warehouse_code_last_error = NULL,
       source_warehouse_code_abandoned_at = NULL
 WHERE is_deleted = FALSE
   AND slip_type = 'OUTBOUND'
   AND source_warehouse_id IS NOT NULL
   AND source_warehouse_code IS NULL
   AND source_warehouse_code_snapshot_status = 'NOT_REQUESTED';
