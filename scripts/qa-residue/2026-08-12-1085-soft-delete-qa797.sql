-- #1085 QA797 residue soft-delete; execute against slip_db with psql -X -v ON_ERROR_STOP=1.
-- This file performs soft-delete only. Accounting DB and #1176 marker rows are untouched.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('qa797-residue-softdelete-2026-08-12', 0));

WITH lq(product_id) AS (VALUES
 ('57dc63e2-43da-43e6-b73e-3c81822cf9a7'::uuid),
 ('7de11ab7-e70c-421e-80a4-7c6b51a2c6e9'::uuid),
 ('ed278526-0e16-427d-8a92-2ca06164254a'::uuid)),
pq(product_id) AS (VALUES
 ('1ea24f99-631f-4e19-937f-be1901284769'::uuid),
 ('57dc63e2-43da-43e6-b73e-3c81822cf9a7'::uuid),
 ('7de11ab7-e70c-421e-80a4-7c6b51a2c6e9'::uuid),
 ('ed278526-0e16-427d-8a92-2ca06164254a'::uuid)),
cs AS (SELECT DISTINCT slip_id FROM slip_lines l JOIN lq q ON q.product_id=l.product_id),
ce AS (SELECT DISTINCT estimate_id FROM estimate_lines l JOIN lq q ON q.product_id=l.product_id)
SELECT
 (SELECT count(*) FROM slip_lines l JOIN lq q ON q.product_id=l.product_id WHERE NOT l.is_deleted)=10
 AND (SELECT count(*) FROM slips s JOIN cs ON cs.slip_id=s.id WHERE NOT s.is_deleted)=0
 AND (SELECT count(*) FROM estimate_lines l JOIN lq q ON q.product_id=l.product_id WHERE NOT l.is_deleted)=53
 AND (SELECT count(*) FROM estimates e JOIN ce ON ce.estimate_id=e.id WHERE NOT e.is_deleted)=25
 AND (SELECT count(*) FROM partner_product_price_memory p JOIN pq q ON q.product_id=p.product_id WHERE NOT p.is_deleted)=8
 AND (SELECT count(*) FROM slip_lines WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=0
 AND (SELECT count(*) FROM slips WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=0
 AND (SELECT count(*) FROM estimate_lines WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=0
 AND (SELECT count(*) FROM estimates WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=0
 AND (SELECT count(*) FROM partner_product_price_memory WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=0
 AS guard_ok
\gset pre_
\if :pre_guard_ok
\else
\echo 'preflight guard failed; ROLLBACK'
ROLLBACK;
DO $$ BEGIN RAISE EXCEPTION 'qa797 preflight guard failed'; END $$;
\endif

UPDATE slip_lines SET is_deleted=TRUE, deleted_at=CURRENT_TIMESTAMP,
 deleted_by='qa797-residue-softdelete-2026-08-12'
WHERE is_deleted=FALSE AND product_id IN (
 '57dc63e2-43da-43e6-b73e-3c81822cf9a7'::uuid,
 '7de11ab7-e70c-421e-80a4-7c6b51a2c6e9'::uuid,
 'ed278526-0e16-427d-8a92-2ca06164254a'::uuid);

UPDATE estimate_lines SET is_deleted=TRUE, deleted_at=CURRENT_TIMESTAMP,
 deleted_by='qa797-residue-softdelete-2026-08-12'
WHERE is_deleted=FALSE AND product_id IN (
 '57dc63e2-43da-43e6-b73e-3c81822cf9a7'::uuid,
 '7de11ab7-e70c-421e-80a4-7c6b51a2c6e9'::uuid,
 'ed278526-0e16-427d-8a92-2ca06164254a'::uuid);

UPDATE estimates e SET is_deleted=TRUE, deleted_at=CURRENT_TIMESTAMP,
 deleted_by='qa797-residue-softdelete-2026-08-12'
WHERE e.is_deleted=FALSE AND EXISTS (
 SELECT 1 FROM estimate_lines l WHERE l.estimate_id=e.id
 AND l.deleted_by='qa797-residue-softdelete-2026-08-12');

UPDATE partner_product_price_memory SET is_deleted=TRUE, deleted_at=CURRENT_TIMESTAMP,
 deleted_by='qa797-residue-softdelete-2026-08-12'
WHERE is_deleted=FALSE AND product_id IN (
 '1ea24f99-631f-4e19-937f-be1901284769'::uuid,
 '57dc63e2-43da-43e6-b73e-3c81822cf9a7'::uuid,
 '7de11ab7-e70c-421e-80a4-7c6b51a2c6e9'::uuid,
 'ed278526-0e16-427d-8a92-2ca06164254a'::uuid);

SELECT
 (SELECT count(*) FROM slip_lines WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=10
 AND (SELECT count(*) FROM slips WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=0
 AND (SELECT count(*) FROM estimate_lines WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=53
 AND (SELECT count(*) FROM estimates WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=25
 AND (SELECT count(*) FROM partner_product_price_memory WHERE deleted_by='qa797-residue-softdelete-2026-08-12')=8
 AND (SELECT count(*) FROM slip_lines WHERE is_deleted=FALSE AND product_id IN (
   '57dc63e2-43da-43e6-b73e-3c81822cf9a7'::uuid,
   '7de11ab7-e70c-421e-80a4-7c6b51a2c6e9'::uuid,
   'ed278526-0e16-427d-8a92-2ca06164254a'::uuid))=0
 AS guard_ok
\gset post_
\if :post_guard_ok
COMMIT;
\else
\echo 'postflight guard failed; ROLLBACK'
ROLLBACK;
DO $$ BEGIN RAISE EXCEPTION 'qa797 postflight guard failed'; END $$;
\endif
