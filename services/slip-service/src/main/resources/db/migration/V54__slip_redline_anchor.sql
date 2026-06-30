-- V54: S2d-1 셀 인라인 레드라인 anchor — 임계 전이 시점 max(slip_revisions.revision_no).
-- 레드라인 = anchor 後 편집 체인(드래프트 편집 제외). NULL = 임계 미통과.
ALTER TABLE slips ADD COLUMN redline_anchor_revision_no INTEGER NULL;

COMMENT ON COLUMN slips.redline_anchor_revision_no IS
  'S2d-1 레드라인 anchor — 임계 전이(OUTBOUND COMPLETED/비-OUTBOUND SENT) 시점 max(slip_revisions.revision_no). 이후 편집만 레드라인. NULL=미통과.';

-- 기존 임계통과 전표 backfill: 현 시점 max revision_no 를 anchor 로(향후 편집부터 레드라인).
UPDATE slips s SET redline_anchor_revision_no = COALESCE(
        (SELECT max(r.revision_no) FROM slip_revisions r
          WHERE r.slip_id = s.id AND r.is_deleted = false), 0)
WHERE s.redline_anchor_revision_no IS NULL
  AND s.revision_count_baseline IS NOT NULL;
