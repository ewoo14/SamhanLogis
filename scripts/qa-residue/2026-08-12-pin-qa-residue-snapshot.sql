\set ON_ERROR_STOP on

-- 이 스크립트가 쓸 대상: slip_db의 현재 QA 삭제 표지 전표 295건·라인 636건.
-- 아래 확인 토큰 없이는 CREATE/INSERT를 실행하지 않는다.
\echo '기록 예정: qa_residue_target_snapshot / qa-residue-softdelete-2026-08-12 / slip 295 / line 636'
\if :{?confirm}
  SELECT :'confirm' = 'PIN_QA_RESIDUE_SNAPSHOT_2026-08-12' AS pin_confirmed \gset
\else
  SELECT false AS pin_confirmed \gset
\endif
\if :pin_confirmed
\else
  \echo 'snapshot 고정 보류: --set=confirm=PIN_QA_RESIDUE_SNAPSHOT_2026-08-12 확인 토큰이 필요합니다.'
  SELECT 1 / 0 AS pin_confirmation_failure;
\endif

\connect slip_db
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('qa-residue-soft-delete-2026-08-12'));

SELECT to_regclass('public.qa_residue_target_snapshot') IS NOT NULL AS snapshot_exists \gset
\if :snapshot_exists
  SELECT COUNT(*) FILTER (WHERE snapshot_key = 'qa-residue-softdelete-2026-08-12' AND entity_type = 'slip') = 295
     AND COUNT(*) FILTER (WHERE snapshot_key = 'qa-residue-softdelete-2026-08-12' AND entity_type = 'line') = 636 AS existing_snapshot_ok
  FROM qa_residue_target_snapshot \gset
  \if :existing_snapshot_ok
    \echo '이미 고정된 snapshot을 유지합니다: slip 295 / line 636 (쓰기 없음).'
    COMMIT;
  \else
    \echo '기존 snapshot 건수가 295/636과 달라 덮어쓰지 않고 중단합니다.'
    ROLLBACK;
    SELECT 1 / 0 AS existing_snapshot_guard_failure;
  \endif
\else
  CREATE TABLE qa_residue_target_snapshot (
    snapshot_key TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    PRIMARY KEY (snapshot_key, entity_type, entity_id)
  );

  CREATE TEMP TABLE qa_pin_slips ON COMMIT DROP AS
  SELECT id
  FROM slips
  WHERE is_deleted AND deleted_by = 'qa-residue-softdelete-2026-08-12';
  CREATE TEMP TABLE qa_pin_lines ON COMMIT DROP AS
  SELECT id
  FROM slip_lines
  WHERE is_deleted AND deleted_by = 'qa-residue-softdelete-2026-08-12';

  SELECT (SELECT COUNT(*) FROM qa_pin_slips) = 295
     AND (SELECT COUNT(*) FROM qa_pin_lines) = 636 AS pin_source_ok \gset
  \if :pin_source_ok
    INSERT INTO qa_residue_target_snapshot (snapshot_key, entity_type, entity_id)
    SELECT 'qa-residue-softdelete-2026-08-12', 'slip', id FROM qa_pin_slips
    UNION ALL
    SELECT 'qa-residue-softdelete-2026-08-12', 'line', id FROM qa_pin_lines;

    SELECT COUNT(*) FILTER (WHERE snapshot_key = 'qa-residue-softdelete-2026-08-12' AND entity_type = 'slip') = 295
       AND COUNT(*) FILTER (WHERE snapshot_key = 'qa-residue-softdelete-2026-08-12' AND entity_type = 'line') = 636 AS pin_after_ok
    FROM qa_residue_target_snapshot \gset
    \if :pin_after_ok
      \echo 'snapshot 고정 완료: slip 295 / line 636.'
      COMMIT;
    \else
      \echo 'snapshot 사후 건수 불일치: 기록을 롤백합니다.'
      ROLLBACK;
      SELECT 1 / 0 AS pin_after_guard_failure;
    \endif
  \else
    \echo '현재 QA 표지 건수가 295/636이 아니므로 snapshot을 기록하지 않습니다.'
    ROLLBACK;
    SELECT 1 / 0 AS pin_source_guard_failure;
  \endif
\endif
