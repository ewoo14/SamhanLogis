-- V53: S2c 상태의존 수정카운트 — 임계 전이 시점 revision_count 스냅샷.
-- editHistoryCount = revision_count_baseline IS NULL ? 0 : max(0, revision_count - revision_count_baseline)
ALTER TABLE slips ADD COLUMN revision_count_baseline INTEGER NULL;

COMMENT ON COLUMN slips.revision_count_baseline IS
  'S2c 상태의존 수정카운트 기준선 — OUTBOUND=COMPLETED/비-OUTBOUND=SENT 전이 시점 revision_count. NULL=임계 미통과(드래프트).';

-- 기존 임계통과 전표 backfill: baseline=0 → editHistoryCount=revision_count(현 표시 보존).
-- 미통과(드래프트)·REJECTED·CANCELED 는 NULL 유지(→0).
UPDATE slips SET revision_count_baseline = 0
WHERE revision_count_baseline IS NULL AND (
  (slip_type = 'OUTBOUND'  AND status IN ('COMPLETED','SHIPPING','DELIVERED','CONFIRMED'))
  OR (slip_type <> 'OUTBOUND' AND status IN ('SENT','ACCEPTED','PROCESSING','INSPECTING','COMPLETED','SHIPPING','DELIVERED','CONFIRMED'))
);
