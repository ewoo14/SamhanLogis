\set ON_ERROR_STOP on

-- 이 스크립트는 양 DB의 QA residue 표지를 비교한다.
-- 기본 모드: 조회만 수행하고, 불일치면 exit 3으로 중단한다.
-- 복구 모드: --set=repair=restore --set=confirm=RESTORE_QA_RESIDUE_2026-08-12 를 함께 준다.
-- 복구 대상은 이미 삭제된 QA 표지 행뿐이며, 부분 상태는 자동 복구하지 않는다.

\if :{?repair}
  SELECT lower(:'repair') = 'restore' AS repair_requested \gset
\else
  SELECT false AS repair_requested \gset
\endif
\if :{?confirm}
  SELECT :'confirm' = 'RESTORE_QA_RESIDUE_2026-08-12' AS repair_confirmed \gset
\else
  SELECT false AS repair_confirmed \gset
\endif

\connect partner_db
BEGIN TRANSACTION READ ONLY;
WITH target AS (
  SELECT id
  FROM partners
  WHERE partner_code ~ '^SOL1154R20-BULK-[0-9]+$'
    AND biz_no = partner_code
    AND created_at >= TIMESTAMP '2026-08-10 01:24:06'
    AND created_at < TIMESTAMP '2026-08-10 01:24:14'
)
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE p.is_deleted AND p.deleted_by = 'qa-residue-softdelete-2026-08-12' AND p.deleted_at IS NOT NULL) AS deleted,
       COUNT(*) FILTER (WHERE NOT p.is_deleted AND p.deleted_by IS NULL AND p.deleted_at IS NULL) AS restored,
       COUNT(*) FILTER (WHERE NOT (p.is_deleted AND p.deleted_by = 'qa-residue-softdelete-2026-08-12' AND p.deleted_at IS NOT NULL)
                              AND NOT (NOT p.is_deleted AND p.deleted_by IS NULL AND p.deleted_at IS NULL)) AS other,
       (SELECT COUNT(*) FROM partners q
        WHERE q.is_deleted AND q.deleted_by = 'qa-residue-softdelete-2026-08-12'
          AND NOT EXISTS (SELECT 1 FROM target t WHERE t.id = q.id)) AS non_target_marker
FROM partners p JOIN target t ON t.id = p.id \gset partner_
COMMIT;

\connect slip_db
BEGIN TRANSACTION READ ONLY;
WITH target_slips AS MATERIALIZED (
  SELECT entity_id AS id FROM qa_residue_target_snapshot
  WHERE snapshot_key = 'qa-residue-softdelete-2026-08-12' AND entity_type = 'slip'
), target_lines AS MATERIALIZED (
  SELECT entity_id AS id FROM qa_residue_target_snapshot
  WHERE snapshot_key = 'qa-residue-softdelete-2026-08-12' AND entity_type = 'line'
)
SELECT (SELECT COUNT(*) FROM target_slips) AS snapshot_slips_total,
       COUNT(s.id) AS physical_slips_total,
       COUNT(*) FILTER (WHERE s.is_deleted AND s.deleted_by = 'qa-residue-softdelete-2026-08-12' AND s.deleted_at IS NOT NULL) AS slips_deleted,
       COUNT(*) FILTER (WHERE NOT s.is_deleted AND s.deleted_by IS NULL AND s.deleted_at IS NULL) AS slips_restored,
       COUNT(*) FILTER (WHERE s.id IS NOT NULL AND NOT ((s.is_deleted AND s.deleted_by = 'qa-residue-softdelete-2026-08-12' AND s.deleted_at IS NOT NULL)
                                                        OR (NOT s.is_deleted AND s.deleted_by IS NULL AND s.deleted_at IS NULL))) AS slips_drift,
       (SELECT COUNT(*) FROM slips s WHERE s.is_deleted AND s.deleted_by = 'qa-residue-softdelete-2026-08-12'
        AND NOT EXISTS (SELECT 1 FROM target_slips t WHERE t.id = s.id)) AS non_target_slip_marker
FROM target_slips t LEFT JOIN slips s ON s.id = t.id
\gset slip_
WITH target_lines AS MATERIALIZED (
  SELECT entity_id AS id FROM qa_residue_target_snapshot
  WHERE snapshot_key = 'qa-residue-softdelete-2026-08-12' AND entity_type = 'line'
)
SELECT (SELECT COUNT(*) FROM target_lines) AS snapshot_lines_total,
       COUNT(l.id) AS physical_lines_total,
       COUNT(*) FILTER (WHERE l.is_deleted AND l.deleted_by = 'qa-residue-softdelete-2026-08-12' AND l.deleted_at IS NOT NULL) AS lines_deleted,
       COUNT(*) FILTER (WHERE NOT l.is_deleted AND l.deleted_by IS NULL AND l.deleted_at IS NULL) AS lines_restored,
       COUNT(*) FILTER (WHERE l.id IS NOT NULL AND NOT ((l.is_deleted AND l.deleted_by = 'qa-residue-softdelete-2026-08-12' AND l.deleted_at IS NOT NULL)
                                                        OR (NOT l.is_deleted AND l.deleted_by IS NULL AND l.deleted_at IS NULL))) AS lines_drift,
       (SELECT COUNT(*) FROM slip_lines l WHERE l.is_deleted AND l.deleted_by = 'qa-residue-softdelete-2026-08-12'
        AND NOT EXISTS (SELECT 1 FROM target_lines t WHERE t.id = l.id)) AS non_target_line_marker
FROM target_lines t LEFT JOIN slip_lines l ON l.id = t.id
\gset slip_
COMMIT;

SELECT (:partner_total::bigint = 1000 AND :partner_deleted::bigint = 1000
        AND :partner_restored::bigint = 0 AND :partner_other::bigint = 0
        AND :partner_non_target_marker::bigint = 0) AS partner_deleted_state,
       (:partner_total::bigint = 1000 AND :partner_deleted::bigint = 0
        AND :partner_restored::bigint = 1000 AND :partner_other::bigint = 0
        AND :partner_non_target_marker::bigint = 0) AS partner_restored_state,
       (:slip_snapshot_slips_total::bigint = 295 AND :slip_physical_slips_total::bigint = 295
        AND :slip_slips_deleted::bigint = 295 AND :slip_slips_restored::bigint = 0
        AND :slip_slips_drift::bigint = 0 AND :slip_non_target_slip_marker::bigint = 0
        AND :slip_snapshot_lines_total::bigint = 636 AND :slip_physical_lines_total::bigint = 636
        AND :slip_lines_deleted::bigint = 636 AND :slip_lines_restored::bigint = 0
        AND :slip_lines_drift::bigint = 0 AND :slip_non_target_line_marker::bigint = 0) AS slip_deleted_state,
       (:slip_snapshot_slips_total::bigint = 295 AND :slip_physical_slips_total::bigint = 295
        AND :slip_slips_deleted::bigint = 0 AND :slip_slips_restored::bigint = 295
        AND :slip_slips_drift::bigint = 0 AND :slip_non_target_slip_marker::bigint = 0
        AND :slip_snapshot_lines_total::bigint = 636 AND :slip_physical_lines_total::bigint = 636
        AND :slip_lines_deleted::bigint = 0 AND :slip_lines_restored::bigint = 636
        AND :slip_lines_drift::bigint = 0 AND :slip_non_target_line_marker::bigint = 0) AS slip_restored_state
\gset state_

\echo '=== QA residue 상태 비교 ==='
\echo 'partner_db: total=' :partner_total ' deleted=' :partner_deleted ' restored=' :partner_restored ' other=' :partner_other ' 대상 외 표지=' :partner_non_target_marker
\echo 'slip_db: snapshot/physical slips=' :slip_snapshot_slips_total '/' :slip_physical_slips_total ' deleted=' :slip_slips_deleted ' restored=' :slip_slips_restored ' drift=' :slip_slips_drift ' 대상 외 표지=' :slip_non_target_slip_marker
\echo 'slip_db: snapshot/physical lines=' :slip_snapshot_lines_total '/' :slip_physical_lines_total ' deleted=' :slip_lines_deleted ' restored=' :slip_lines_restored ' drift=' :slip_lines_drift ' 대상 외 표지=' :slip_non_target_line_marker

SELECT ((:'state_partner_deleted_state'::boolean AND :'state_slip_deleted_state'::boolean)
     OR (:'state_partner_restored_state'::boolean AND :'state_slip_restored_state'::boolean)) AS matched \gset
\if :matched
  \echo '결과: 양쪽 상태가 일치합니다. 자동 복구 없음.'
\else
  \echo '결과: 불일치 또는 부분 상태입니다.'
  \echo '복구 방향: 삭제 표지가 남은 쪽을 복구 상태로 맞추십시오. 부분 상태는 수동 식별 후 처리하십시오.'
  SELECT (:'state_partner_deleted_state'::boolean AND :'state_slip_restored_state'::boolean) AS restore_partner,
         (:'state_slip_deleted_state'::boolean AND :'state_partner_restored_state'::boolean) AS restore_slip \gset repair_
  \if :repair_requested
    \if :repair_confirmed
      \if :repair_restore_partner
        \connect partner_db
        BEGIN;
        SELECT pg_advisory_xact_lock(hashtext('qa-residue-soft-delete-2026-08-12'));
        WITH target AS (
          SELECT id FROM partners
          WHERE partner_code ~ '^SOL1154R20-BULK-[0-9]+$'
            AND biz_no = partner_code
            AND created_at >= TIMESTAMP '2026-08-10 01:24:06'
            AND created_at < TIMESTAMP '2026-08-10 01:24:14'
        )
        UPDATE partners p
        SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL, deleted_by_name = NULL
        WHERE p.is_deleted AND p.deleted_by = 'qa-residue-softdelete-2026-08-12'
          AND EXISTS (SELECT 1 FROM target t WHERE t.id = p.id);
        WITH target AS (
          SELECT id FROM partners
          WHERE partner_code ~ '^SOL1154R20-BULK-[0-9]+$'
            AND biz_no = partner_code
            AND created_at >= TIMESTAMP '2026-08-10 01:24:06'
            AND created_at < TIMESTAMP '2026-08-10 01:24:14'
        )
        SELECT (SELECT COUNT(*) FROM target) = 1000
           AND (SELECT COUNT(*) FROM partners p JOIN target t ON t.id = p.id
                WHERE NOT p.is_deleted AND p.deleted_at IS NULL AND p.deleted_by IS NULL) = 1000
           AND (SELECT COUNT(*) FROM partners p JOIN target t ON t.id = p.id
                WHERE p.is_deleted OR p.deleted_at IS NOT NULL OR p.deleted_by IS NOT NULL) = 0
           AND (SELECT COUNT(*) FROM partners p
                WHERE p.is_deleted AND p.deleted_by = 'qa-residue-softdelete-2026-08-12'
                  AND NOT EXISTS (SELECT 1 FROM target t WHERE t.id = p.id)) = 0 AS repaired \gset
        \if :repaired
          COMMIT;
          \echo '복구 완료: partner_db를 복구 상태로 맞췄습니다.'
        \else
          ROLLBACK;
          \echo '복구 실패: partner_db 사후 건수가 1,000이 아니므로 롤백했습니다.'
          SELECT 1 / 0 AS repair_guard_failure;
        \endif
      \elif :repair_restore_slip
        \connect slip_db
        BEGIN;
        SELECT pg_advisory_xact_lock(hashtext('qa-residue-soft-delete-2026-08-12'));
        WITH target_lines AS (
          SELECT entity_id AS id FROM qa_residue_target_snapshot
          WHERE snapshot_key = 'qa-residue-softdelete-2026-08-12' AND entity_type = 'line'
        )
        UPDATE slip_lines l SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL
        WHERE l.is_deleted AND l.deleted_by = 'qa-residue-softdelete-2026-08-12'
          AND EXISTS (SELECT 1 FROM target_lines t WHERE t.id = l.id);
        WITH target_slips AS (
          SELECT entity_id AS id FROM qa_residue_target_snapshot
          WHERE snapshot_key = 'qa-residue-softdelete-2026-08-12' AND entity_type = 'slip'
        )
        UPDATE slips s SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL, deleted_by_name = NULL
        WHERE s.is_deleted AND s.deleted_by = 'qa-residue-softdelete-2026-08-12'
          AND EXISTS (SELECT 1 FROM target_slips t WHERE t.id = s.id);
        WITH target_slips AS (
          SELECT entity_id AS id FROM qa_residue_target_snapshot
          WHERE snapshot_key = 'qa-residue-softdelete-2026-08-12' AND entity_type = 'slip'
        ), target_lines AS (
          SELECT entity_id AS id FROM qa_residue_target_snapshot
          WHERE snapshot_key = 'qa-residue-softdelete-2026-08-12' AND entity_type = 'line'
        )
        SELECT (SELECT COUNT(*) FROM target_slips) = 295
           AND (SELECT COUNT(*) FROM target_lines) = 636
           AND (SELECT COUNT(*) FROM slips s JOIN target_slips t ON t.id = s.id
                WHERE NOT s.is_deleted AND s.deleted_at IS NULL AND s.deleted_by IS NULL) = 295
           AND (SELECT COUNT(*) FROM slip_lines l JOIN target_lines t ON t.id = l.id
                WHERE NOT l.is_deleted AND l.deleted_at IS NULL AND l.deleted_by IS NULL) = 636
           AND (SELECT COUNT(*) FROM slips s
                WHERE s.is_deleted AND s.deleted_by = 'qa-residue-softdelete-2026-08-12') = 0
           AND (SELECT COUNT(*) FROM slip_lines l
                WHERE l.is_deleted AND l.deleted_by = 'qa-residue-softdelete-2026-08-12') = 0
           AND (SELECT COUNT(*) FROM slips s
                WHERE s.is_deleted AND s.deleted_by = 'qa-residue-softdelete-2026-08-12'
                  AND NOT EXISTS (SELECT 1 FROM target_slips t WHERE t.id = s.id)) = 0
           AND (SELECT COUNT(*) FROM slip_lines l
                WHERE l.is_deleted AND l.deleted_by = 'qa-residue-softdelete-2026-08-12'
                  AND NOT EXISTS (SELECT 1 FROM target_lines t WHERE t.id = l.id)) = 0 AS repaired \gset
        \if :repaired
          COMMIT;
          \echo '복구 완료: slip_db를 복구 상태로 맞췄습니다.'
        \else
          ROLLBACK;
          \echo '복구 실패: slip_db 사후 표지가 0이 아니므로 롤백했습니다.'
          SELECT 1 / 0 AS repair_guard_failure;
        \endif
      \else
        \echo '자동 복구 불가: 두 DB 중 한쪽이 완전 삭제/완전 복구 상태가 아닙니다.'
        SELECT 1 / 0 AS partial_state_guard_failure;
      \endif
    \else
      \echo '복구 보류: --set=confirm=RESTORE_QA_RESIDUE_2026-08-12 확인 토큰이 필요합니다.'
      SELECT 1 / 0 AS repair_confirmation_failure;
    \endif
  \else
    \echo '복구 보류: 조회만 수행했습니다. 확인 후 --set=repair=restore 를 명시하십시오.'
    SELECT 1 / 0 AS mismatch_guard_failure;
  \endif
\endif
