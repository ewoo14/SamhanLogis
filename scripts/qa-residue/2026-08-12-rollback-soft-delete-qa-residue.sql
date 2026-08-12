\set ON_ERROR_STOP on
\connect partner_db

BEGIN;

CREATE TEMP TABLE qa_partner_rollback_targets ON COMMIT DROP AS
SELECT id
FROM partners
WHERE is_deleted
  AND deleted_by = 'qa-residue-softdelete-2026-08-12';

SELECT COUNT(*) = 1000 AS partner_before_ok
FROM qa_partner_rollback_targets
\gset

\if :partner_before_ok
  UPDATE partners p
  SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL, deleted_by_name = NULL
  FROM qa_partner_rollback_targets t
  WHERE p.id = t.id
    AND p.is_deleted
    AND p.deleted_by = 'qa-residue-softdelete-2026-08-12';

  SELECT COUNT(*) = 1000 AS partner_after_ok
  FROM partners p JOIN qa_partner_rollback_targets t ON t.id = p.id
  WHERE NOT p.is_deleted
    AND p.deleted_at IS NULL
    AND p.deleted_by IS NULL
    AND p.deleted_by_name IS NULL
  \gset
\else
  \echo '예상치 불일치: partner_db 복구 표지가 1,000행이 아니므로 롤백합니다.'
  ROLLBACK;
  SELECT 1 / 0 AS rollback_guard_failure;
\endif

\if :partner_after_ok
  SELECT 'partner_db rollback' AS measure, COUNT(*) AS rows
  FROM partners p JOIN qa_partner_rollback_targets t ON t.id = p.id
  WHERE NOT p.is_deleted AND p.deleted_by IS NULL;
  COMMIT;
\else
  \echo '사후 건수 불일치: partner_db 복구 결과가 1,000행이 아니므로 롤백합니다.'
  ROLLBACK;
  SELECT 1 / 0 AS rollback_guard_failure;
\endif

\connect slip_db
BEGIN;

CREATE TEMP TABLE qa_slip_rollback_targets ON COMMIT DROP AS
SELECT id
FROM slips
WHERE is_deleted
  AND deleted_by = 'qa-residue-softdelete-2026-08-12';

CREATE TEMP TABLE qa_line_rollback_targets ON COMMIT DROP AS
SELECT id
FROM slip_lines
WHERE is_deleted
  AND deleted_by = 'qa-residue-softdelete-2026-08-12';

SELECT (SELECT COUNT(*) FROM qa_slip_rollback_targets) = 295
   AND (SELECT COUNT(*) FROM qa_line_rollback_targets) = 636 AS slip_before_ok
\gset

\if :slip_before_ok
  UPDATE slip_lines l
  SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL
  FROM qa_line_rollback_targets t
  WHERE l.id = t.id
    AND l.is_deleted
    AND l.deleted_by = 'qa-residue-softdelete-2026-08-12';

  UPDATE slips s
  SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL, deleted_by_name = NULL
  FROM qa_slip_rollback_targets t
  WHERE s.id = t.id
    AND s.is_deleted
    AND s.deleted_by = 'qa-residue-softdelete-2026-08-12';

  SELECT (SELECT COUNT(*) FROM slips s JOIN qa_slip_rollback_targets t ON t.id = s.id
          WHERE NOT s.is_deleted AND s.deleted_at IS NULL AND s.deleted_by IS NULL
            AND s.deleted_by_name IS NULL) = 295
     AND (SELECT COUNT(*) FROM slip_lines l JOIN qa_line_rollback_targets t ON t.id = l.id
          WHERE NOT l.is_deleted AND l.deleted_at IS NULL AND l.deleted_by IS NULL) = 636
    AS slip_after_ok
  \gset
\else
  \echo '예상치 불일치: slip_db 복구 표지가 전표 295행·라인 636행이 아니므로 롤백합니다.'
  ROLLBACK;
  SELECT 1 / 0 AS rollback_guard_failure;
\endif

\if :slip_after_ok
  SELECT 'slip_db.slips rollback' AS measure, COUNT(*) AS rows
  FROM slips s JOIN qa_slip_rollback_targets t ON t.id = s.id
  WHERE NOT s.is_deleted AND s.deleted_by IS NULL;
  SELECT 'slip_db.slip_lines rollback' AS measure, COUNT(*) AS rows
  FROM slip_lines l JOIN qa_line_rollback_targets t ON t.id = l.id
  WHERE NOT l.is_deleted AND l.deleted_by IS NULL;
  COMMIT;
\else
  \echo '사후 건수 불일치: slip_db 복구 결과가 전표 295행·라인 636행이 아니므로 롤백합니다.'
  ROLLBACK;
  SELECT 1 / 0 AS rollback_guard_failure;
\endif
