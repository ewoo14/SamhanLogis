\set ON_ERROR_STOP on

-- 두 DB의 표지를 먼저 모두 검증한다. 어느 한쪽이라도 드리프트하면 UPDATE 전에 중단한다.
\connect partner_db
SELECT pg_advisory_lock(hashtext('qa-residue-soft-delete-2026-08-12'));
BEGIN;
CREATE TEMP TABLE qa_partner_preflight ON COMMIT DROP AS
SELECT id
FROM partners
WHERE NOT is_deleted
  AND partner_code ~ '^SOL1154R20-BULK-[0-9]+$'
  AND biz_no = partner_code
  AND created_at >= TIMESTAMP '2026-08-10 01:24:06'
  AND created_at < TIMESTAMP '2026-08-10 01:24:14';
SELECT COUNT(*) = 1000 AS partner_preflight_ok
FROM qa_partner_preflight
\gset
\if :partner_preflight_ok
  ROLLBACK;
\else
  \echo '예상치 불일치: partner 대상이 1,000행이 아니므로 실행하지 않습니다.'
  ROLLBACK;
  SELECT pg_advisory_unlock(hashtext('qa-residue-soft-delete-2026-08-12'));
  SELECT 1 / 0 AS preflight_guard_failure;
\endif

\connect slip_db
SELECT pg_advisory_lock(hashtext('qa-residue-soft-delete-2026-08-12'));
BEGIN;
CREATE TEMP TABLE qa_slip_line_candidates ON COMMIT DROP AS
SELECT l.id AS line_id, l.slip_id
FROM slip_lines l
WHERE NOT l.is_deleted
  AND (
    (l.created_by = 'system'
     AND l.created_at BETWEEN TIMESTAMP '2026-05-09 16:59:33.210336'
                          AND TIMESTAMP '2026-05-09 16:59:33.901047')
    OR (l.created_by = 'system-internal'
        AND l.created_at BETWEEN TIMESTAMP '2026-05-30 13:37:02.475652'
                             AND TIMESTAMP '2026-05-30 13:39:39.203576')
    OR l.product_id IN (
      '57dc63e2-43da-43e6-b73e-3c81822cf9a7',
      '7de11ab7-e70c-421e-80a4-7c6b51a2c6e9',
      'ed278526-0e16-427d-8a92-2ca06164254a'
    )
  );
CREATE TEMP TABLE qa_slip_preflight ON COMMIT DROP AS
SELECT DISTINCT s.id
FROM slips s JOIN qa_slip_line_candidates c ON c.slip_id = s.id
WHERE NOT s.is_deleted;
CREATE TEMP TABLE qa_line_preflight ON COMMIT DROP AS
SELECT l.id
FROM slip_lines l JOIN qa_slip_preflight s ON s.id = l.slip_id
WHERE NOT l.is_deleted;
SELECT (SELECT COUNT(*) FROM qa_slip_preflight) = 295
   AND (SELECT COUNT(*) FROM qa_line_preflight) = 636 AS slip_preflight_ok
\gset
\if :slip_preflight_ok
  ROLLBACK;
\else
  \echo '예상치 불일치: slip 대상 전표 295행·라인 636행이 아니므로 실행하지 않습니다.'
  ROLLBACK;
  SELECT pg_advisory_unlock(hashtext('qa-residue-soft-delete-2026-08-12'));
  SELECT 1 / 0 AS preflight_guard_failure;
\endif

-- 양쪽 사전 검사가 끝난 뒤에만 실제 변경을 시작한다.
\connect partner_db
SELECT pg_advisory_lock(hashtext('qa-residue-soft-delete-2026-08-12'));
BEGIN;
CREATE TEMP TABLE qa_partner_targets ON COMMIT DROP AS
SELECT id
FROM partners
WHERE NOT is_deleted
  AND partner_code ~ '^SOL1154R20-BULK-[0-9]+$'
  AND biz_no = partner_code
  AND created_at >= TIMESTAMP '2026-08-10 01:24:06'
  AND created_at < TIMESTAMP '2026-08-10 01:24:14';
SELECT COUNT(*) = 1000 AS partner_before_ok FROM qa_partner_targets \gset
\if :partner_before_ok
  UPDATE partners p
  SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP,
      deleted_by = 'qa-residue-softdelete-2026-08-12',
      deleted_by_name = 'QA residue soft-delete'
  FROM qa_partner_targets t
  WHERE p.id = t.id AND NOT p.is_deleted;
  SELECT COUNT(*) = 1000 AS partner_after_ok
  FROM partners p JOIN qa_partner_targets t ON t.id = p.id
  WHERE p.is_deleted AND p.deleted_by = 'qa-residue-softdelete-2026-08-12' \gset
\else
  \echo '실행 직전 partner 표지가 변동되어 실행하지 않습니다.'
  ROLLBACK;
  SELECT pg_advisory_unlock(hashtext('qa-residue-soft-delete-2026-08-12'));
  SELECT 1 / 0 AS execution_guard_failure;
\endif
\if :partner_after_ok
  COMMIT;
  SELECT pg_advisory_unlock(hashtext('qa-residue-soft-delete-2026-08-12'));
\else
  \echo 'partner 사후 건수 불일치: 변경을 롤백합니다.'
  ROLLBACK;
  SELECT pg_advisory_unlock(hashtext('qa-residue-soft-delete-2026-08-12'));
  SELECT 1 / 0 AS execution_guard_failure;
\endif

\connect slip_db
SELECT pg_advisory_lock(hashtext('qa-residue-soft-delete-2026-08-12'));
BEGIN;
CREATE TEMP TABLE qa_slip_targets ON COMMIT DROP AS
SELECT DISTINCT s.id
FROM slips s
JOIN slip_lines l ON l.slip_id = s.id
WHERE NOT s.is_deleted AND NOT l.is_deleted
  AND (
    (l.created_by = 'system'
     AND l.created_at BETWEEN TIMESTAMP '2026-05-09 16:59:33.210336'
                          AND TIMESTAMP '2026-05-09 16:59:33.901047')
    OR (l.created_by = 'system-internal'
        AND l.created_at BETWEEN TIMESTAMP '2026-05-30 13:37:02.475652'
                             AND TIMESTAMP '2026-05-30 13:39:39.203576')
    OR l.product_id IN (
      '57dc63e2-43da-43e6-b73e-3c81822cf9a7',
      '7de11ab7-e70c-421e-80a4-7c6b51a2c6e9',
      'ed278526-0e16-427d-8a92-2ca06164254a'
    )
  );
CREATE TEMP TABLE qa_line_targets ON COMMIT DROP AS
SELECT l.id FROM slip_lines l JOIN qa_slip_targets s ON s.id = l.slip_id WHERE NOT l.is_deleted;
SELECT (SELECT COUNT(*) FROM qa_slip_targets) = 295
   AND (SELECT COUNT(*) FROM qa_line_targets) = 636 AS slip_before_ok \gset
\if :slip_before_ok
  UPDATE slip_lines l SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP,
      deleted_by = 'qa-residue-softdelete-2026-08-12'
  FROM qa_line_targets t WHERE l.id = t.id AND NOT l.is_deleted;
  UPDATE slips s SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP,
      deleted_by = 'qa-residue-softdelete-2026-08-12',
      deleted_by_name = 'QA residue soft-delete'
  FROM qa_slip_targets t WHERE s.id = t.id AND NOT s.is_deleted;
  SELECT (SELECT COUNT(*) FROM slips s JOIN qa_slip_targets t ON t.id=s.id
          WHERE s.is_deleted AND s.deleted_by='qa-residue-softdelete-2026-08-12') = 295
     AND (SELECT COUNT(*) FROM slip_lines l JOIN qa_line_targets t ON t.id=l.id
          WHERE l.is_deleted AND l.deleted_by='qa-residue-softdelete-2026-08-12') = 636 AS slip_after_ok \gset
\else
  \echo '실행 직전 slip 표지가 변동되어 실행하지 않습니다.'
  ROLLBACK;
  SELECT pg_advisory_unlock(hashtext('qa-residue-soft-delete-2026-08-12'));
  SELECT 1 / 0 AS execution_guard_failure;
\endif
\if :slip_after_ok
  COMMIT;
  SELECT pg_advisory_unlock(hashtext('qa-residue-soft-delete-2026-08-12'));
\else
  \echo 'slip 사후 건수 불일치: 변경을 롤백합니다.'
  ROLLBACK;
  SELECT pg_advisory_unlock(hashtext('qa-residue-soft-delete-2026-08-12'));
  SELECT 1 / 0 AS execution_guard_failure;
\endif
