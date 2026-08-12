\set ON_ERROR_STOP on

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
  SELECT id FROM partners
  WHERE partner_code ~ '^SOL1154R20-BULK-[0-9]+$' AND biz_no = partner_code
    AND created_at >= TIMESTAMP '2026-08-10 01:24:06' AND created_at < TIMESTAMP '2026-08-10 01:24:14'
)
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE p.is_deleted AND p.deleted_by = 'qa-residue-softdelete-2026-08-12' AND p.deleted_at IS NOT NULL) AS deleted,
       COUNT(*) FILTER (WHERE NOT p.is_deleted AND p.deleted_by IS NULL AND p.deleted_at IS NULL) AS restored,
       COUNT(*) FILTER (WHERE NOT (p.is_deleted AND p.deleted_by = 'qa-residue-softdelete-2026-08-12' AND p.deleted_at IS NOT NULL)
                              AND NOT (NOT p.is_deleted AND p.deleted_by IS NULL AND p.deleted_at IS NULL)) AS other,
       (SELECT COUNT(*) FROM partners q WHERE q.is_deleted AND q.deleted_by = 'qa-residue-softdelete-2026-08-12'
        AND NOT EXISTS (SELECT 1 FROM target t WHERE t.id = q.id)) AS non_target_marker
FROM partners p JOIN target t ON t.id = p.id \gset partner_
COMMIT;

\connect slip_db
SELECT to_regclass('public.qa_residue_target_snapshot') IS NOT NULL AS snapshot_exists \gset
\if :snapshot_exists
\else
  \echo 'snapshot을 먼저 고정하십시오: 2026-08-12-pin-qa-residue-snapshot.sql'
  SELECT 1 / 0 AS missing_snapshot_guard_failure;
\endif
BEGIN TRANSACTION READ ONLY;
\if :snapshot_exists
  SELECT COUNT(*) AS snapshot_slips_total, COUNT(s.id) AS physical_slips_total,
         COUNT(*) FILTER (WHERE s.is_deleted AND s.deleted_by = 'qa-residue-softdelete-2026-08-12' AND s.deleted_at IS NOT NULL) AS slips_deleted,
         COUNT(*) FILTER (WHERE NOT s.is_deleted AND s.deleted_by IS NULL AND s.deleted_at IS NULL) AS slips_restored,
         COUNT(*) FILTER (WHERE s.id IS NOT NULL AND NOT ((s.is_deleted AND s.deleted_by = 'qa-residue-softdelete-2026-08-12' AND s.deleted_at IS NOT NULL) OR (NOT s.is_deleted AND s.deleted_by IS NULL AND s.deleted_at IS NULL))) AS slips_drift,
         (SELECT COUNT(*) FROM slips s WHERE s.is_deleted AND s.deleted_by = 'qa-residue-softdelete-2026-08-12' AND NOT EXISTS (SELECT 1 FROM qa_residue_target_snapshot t WHERE t.snapshot_key = 'qa-residue-softdelete-2026-08-12' AND t.entity_type = 'slip' AND t.entity_id = s.id)) AS non_target_slip_marker
  FROM qa_residue_target_snapshot t LEFT JOIN slips s ON s.id = t.entity_id
  WHERE t.snapshot_key = 'qa-residue-softdelete-2026-08-12' AND t.entity_type = 'slip' \gset slip_
  SELECT COUNT(*) AS snapshot_lines_total, COUNT(l.id) AS physical_lines_total,
         COUNT(*) FILTER (WHERE l.is_deleted AND l.deleted_by = 'qa-residue-softdelete-2026-08-12' AND l.deleted_at IS NOT NULL) AS lines_deleted,
         COUNT(*) FILTER (WHERE NOT l.is_deleted AND l.deleted_by IS NULL AND l.deleted_at IS NULL) AS lines_restored,
         COUNT(*) FILTER (WHERE l.id IS NOT NULL AND NOT ((l.is_deleted AND l.deleted_by = 'qa-residue-softdelete-2026-08-12' AND l.deleted_at IS NOT NULL) OR (NOT l.is_deleted AND l.deleted_by IS NULL AND l.deleted_at IS NULL))) AS lines_drift,
         (SELECT COUNT(*) FROM slip_lines l WHERE l.is_deleted AND l.deleted_by = 'qa-residue-softdelete-2026-08-12' AND NOT EXISTS (SELECT 1 FROM qa_residue_target_snapshot t WHERE t.snapshot_key = 'qa-residue-softdelete-2026-08-12' AND t.entity_type = 'line' AND t.entity_id = l.id)) AS non_target_line_marker
  FROM qa_residue_target_snapshot t LEFT JOIN slip_lines l ON l.id = t.entity_id
  WHERE t.snapshot_key = 'qa-residue-softdelete-2026-08-12' AND t.entity_type = 'line' \gset slip_
\endif
COMMIT;

SELECT (:partner_total::bigint = 1000 AND :partner_deleted::bigint = 1000 AND :partner_restored::bigint = 0 AND :partner_other::bigint = 0 AND :partner_non_target_marker::bigint = 0) AS partner_deleted_state,
       (:partner_total::bigint = 1000 AND :partner_deleted::bigint = 0 AND :partner_restored::bigint = 1000 AND :partner_other::bigint = 0 AND :partner_non_target_marker::bigint = 0) AS partner_restored_state,
       (:slip_snapshot_slips_total::bigint = 295 AND :slip_physical_slips_total::bigint = 295 AND :slip_slips_deleted::bigint = 295 AND :slip_slips_restored::bigint = 0 AND :slip_slips_drift::bigint = 0 AND :slip_non_target_slip_marker::bigint = 0 AND :slip_snapshot_lines_total::bigint = 636 AND :slip_physical_lines_total::bigint = 636 AND :slip_lines_deleted::bigint = 636 AND :slip_lines_restored::bigint = 0 AND :slip_lines_drift::bigint = 0 AND :slip_non_target_line_marker::bigint = 0) AS slip_deleted_state,
       (:partner_total::bigint = 1000 AND :partner_deleted::bigint = 0 AND :partner_restored::bigint = 1000 AND :partner_other::bigint = 0 AND :slip_snapshot_slips_total::bigint = 295 AND :slip_physical_slips_total::bigint = 295 AND :slip_slips_deleted::bigint = 0 AND :slip_slips_restored::bigint = 295 AND :slip_slips_drift::bigint = 0 AND :slip_non_target_slip_marker::bigint = 0 AND :slip_snapshot_lines_total::bigint = 636 AND :slip_physical_lines_total::bigint = 636 AND :slip_lines_deleted::bigint = 0 AND :slip_lines_restored::bigint = 636 AND :slip_lines_drift::bigint = 0 AND :slip_non_target_line_marker::bigint = 0) AS slip_restored_state \gset state_

\echo '=== QA residue 상태 비교 ==='
\echo 'partner_db: total=' :partner_total ' deleted=' :partner_deleted ' restored=' :partner_restored ' other=' :partner_other ' non-target=' :partner_non_target_marker
\echo 'slip_db: snapshot/physical slips=' :slip_snapshot_slips_total '/' :slip_physical_slips_total ' deleted=' :slip_slips_deleted ' restored=' :slip_slips_restored ' drift=' :slip_slips_drift ' non-target=' :slip_non_target_slip_marker
\echo 'slip_db: snapshot/physical lines=' :slip_snapshot_lines_total '/' :slip_physical_lines_total ' deleted=' :slip_lines_deleted ' restored=' :slip_lines_restored ' drift=' :slip_lines_drift ' non-target=' :slip_non_target_line_marker
SELECT ((:'state_partner_deleted_state'::boolean AND :'state_slip_deleted_state'::boolean) OR (:'state_partner_restored_state'::boolean AND :'state_slip_restored_state'::boolean)) AS matched \gset
\if :matched
  \echo '결과: 양쪽 상태가 일치합니다. 자동 복구는 실행하지 않습니다.'
\else
  \echo '결과: 불일치 상태입니다.'
  SELECT (:'state_partner_deleted_state'::boolean AND :'state_slip_restored_state'::boolean) AS restore_partner, (:'state_slip_deleted_state'::boolean AND :'state_partner_restored_state'::boolean) AS restore_slip \gset repair_
  \if :repair_requested
    \if :repair_confirmed
      \if :repair_restore_partner
        \connect partner_db
        BEGIN; SELECT pg_advisory_xact_lock(hashtext('qa-residue-soft-delete-2026-08-12'));
        WITH target AS (SELECT id FROM partners WHERE partner_code ~ '^SOL1154R20-BULK-[0-9]+$' AND biz_no = partner_code AND created_at >= TIMESTAMP '2026-08-10 01:24:06' AND created_at < TIMESTAMP '2026-08-10 01:24:14')
        UPDATE partners p SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL, deleted_by_name = NULL FROM target t WHERE p.id = t.id AND p.is_deleted AND p.deleted_by = 'qa-residue-softdelete-2026-08-12';
        SELECT COUNT(*) = 1000 AS repaired FROM partners p WHERE NOT p.is_deleted AND p.deleted_at IS NULL AND p.deleted_by IS NULL AND p.partner_code ~ '^SOL1154R20-BULK-[0-9]+$' AND p.biz_no = p.partner_code AND p.created_at >= TIMESTAMP '2026-08-10 01:24:06' AND p.created_at < TIMESTAMP '2026-08-10 01:24:14' \gset
        \if :repaired
          COMMIT;
          \echo '복구 완료: partner_db를 복구 상태로 맞췄습니다.'
        \else
          ROLLBACK;
          SELECT 1 / 0 AS repair_guard_failure;
        \endif
      \elif :repair_restore_slip
        \connect slip_db
        BEGIN; SELECT pg_advisory_xact_lock(hashtext('qa-residue-soft-delete-2026-08-12'));
        CREATE TEMP TABLE qa_repair_slips ON COMMIT DROP AS SELECT entity_id AS id FROM qa_residue_target_snapshot WHERE snapshot_key = 'qa-residue-softdelete-2026-08-12' AND entity_type = 'slip';
        CREATE TEMP TABLE qa_repair_lines ON COMMIT DROP AS SELECT entity_id AS id FROM qa_residue_target_snapshot WHERE snapshot_key = 'qa-residue-softdelete-2026-08-12' AND entity_type = 'line';
        UPDATE slip_lines l SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL FROM qa_repair_lines t WHERE l.id = t.id AND l.is_deleted AND l.deleted_by = 'qa-residue-softdelete-2026-08-12';
        UPDATE slips s SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL, deleted_by_name = NULL FROM qa_repair_slips t WHERE s.id = t.id AND s.is_deleted AND s.deleted_by = 'qa-residue-softdelete-2026-08-12';
        SELECT (SELECT COUNT(*) FROM qa_repair_slips) = 295 AND (SELECT COUNT(*) FROM qa_repair_lines) = 636 AND (SELECT COUNT(*) FROM slips s JOIN qa_repair_slips t ON t.id=s.id WHERE NOT s.is_deleted AND s.deleted_at IS NULL AND s.deleted_by IS NULL) = 295 AND (SELECT COUNT(*) FROM slip_lines l JOIN qa_repair_lines t ON t.id=l.id WHERE NOT l.is_deleted AND l.deleted_at IS NULL AND l.deleted_by IS NULL) = 636 AND (SELECT COUNT(*) FROM slips WHERE is_deleted AND deleted_by='qa-residue-softdelete-2026-08-12') = 0 AND (SELECT COUNT(*) FROM slip_lines WHERE is_deleted AND deleted_by='qa-residue-softdelete-2026-08-12') = 0 AS repaired \gset
        \if :repaired
          COMMIT;
          \echo '복구 완료: slip_db를 복구 상태로 맞췄습니다.'
        \else
          ROLLBACK;
          SELECT 1 / 0 AS repair_guard_failure;
        \endif
      \else
        \echo '자동 복구 불가: 양쪽 DB가 완전 삭제/완전 복구 상태가 아닙니다.'
        SELECT 1 / 0 AS partial_state_guard_failure;
      \endif
    \else
      \echo '복구 보류: --set=confirm=RESTORE_QA_RESIDUE_2026-08-12 확인 토큰이 필요합니다.'
      SELECT 1 / 0 AS repair_confirmation_failure;
    \endif
  \else
    \echo '복구 보류: 조회만 실행했습니다. 확인 후 --set=repair=restore를 명시하십시오.'
    SELECT 1 / 0 AS mismatch_guard_failure;
  \endif
\endif
