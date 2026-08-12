\set ON_ERROR_STOP on
\connect partner_db

BEGIN;

UPDATE partners
SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL, deleted_by_name = NULL
WHERE is_deleted AND deleted_by = 'qa-residue-softdelete-2026-08-12';

UPDATE slip_lines
SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL
WHERE is_deleted AND deleted_by = 'qa-residue-softdelete-2026-08-12';

UPDATE slips
SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL, deleted_by_name = NULL
WHERE is_deleted AND deleted_by = 'qa-residue-softdelete-2026-08-12';

SELECT 'rollback marker counts' AS measure,
       (SELECT COUNT(*) FROM partners WHERE deleted_by = 'qa-residue-softdelete-2026-08-12') AS partners,
       (SELECT COUNT(*) FROM slips WHERE deleted_by = 'qa-residue-softdelete-2026-08-12') AS slips,
       (SELECT COUNT(*) FROM slip_lines WHERE deleted_by = 'qa-residue-softdelete-2026-08-12') AS lines;

COMMIT;

\connect slip_db
BEGIN;

UPDATE slip_lines
SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL
WHERE is_deleted AND deleted_by = 'qa-residue-softdelete-2026-08-12';

UPDATE slips
SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL, deleted_by_name = NULL
WHERE is_deleted AND deleted_by = 'qa-residue-softdelete-2026-08-12';

SELECT 'slip rollback marker counts' AS measure,
       (SELECT COUNT(*) FROM slips WHERE deleted_by = 'qa-residue-softdelete-2026-08-12') AS slips,
       (SELECT COUNT(*) FROM slip_lines WHERE deleted_by = 'qa-residue-softdelete-2026-08-12') AS lines;

COMMIT;
