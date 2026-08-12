-- #1085 QA797 residue rollback
-- 실행 대상 DB: slip_db
-- 실행 표지에만 대칭 적용한다. #1176 표지(qa-residue-softdelete-2026-08-12)는 건드리지 않는다.

\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('qa797-residue-softdelete-2026-08-12', 0));

SELECT (
    (SELECT count(*) FROM slip_lines WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=10
AND (SELECT count(*) FROM slips WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=0
AND (SELECT count(*) FROM estimate_lines WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=53
AND (SELECT count(*) FROM estimates WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=25
AND (SELECT count(*) FROM partner_product_price_memory WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=8
) AS guard_ok
\gset pre_

\if :pre_guard_ok
\else
\echo '되돌림 사전 건수 가드 실패: ROLLBACK'
ROLLBACK;
DO $$ BEGIN RAISE EXCEPTION 'qa797 rollback preflight guard failed'; END $$;
\endif

UPDATE slip_lines
SET is_deleted=FALSE, deleted_at=NULL, deleted_by=NULL
WHERE deleted_by='qa797-residue-softdelete-2026-08-12';

UPDATE estimate_lines
SET is_deleted=FALSE, deleted_at=NULL, deleted_by=NULL
WHERE deleted_by='qa797-residue-softdelete-2026-08-12';

UPDATE estimates
SET is_deleted=FALSE, deleted_at=NULL, deleted_by=NULL
WHERE deleted_by='qa797-residue-softdelete-2026-08-12';

UPDATE partner_product_price_memory
SET is_deleted=FALSE, deleted_at=NULL, deleted_by=NULL
WHERE deleted_by='qa797-residue-softdelete-2026-08-12';

SELECT (
    (SELECT count(*) FROM slip_lines WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=0
AND (SELECT count(*) FROM slips WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=0
AND (SELECT count(*) FROM estimate_lines WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=0
AND (SELECT count(*) FROM estimates WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=0
AND (SELECT count(*) FROM partner_product_price_memory WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=0
) AS guard_ok
\gset post_

\if :post_guard_ok
COMMIT;
\else
\echo '되돌림 사후 검증 실패: ROLLBACK'
ROLLBACK;
DO $$ BEGIN RAISE EXCEPTION 'qa797 rollback postflight guard failed'; END $$;
\endif
