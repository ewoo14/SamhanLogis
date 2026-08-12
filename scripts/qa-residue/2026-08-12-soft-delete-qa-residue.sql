\set ON_ERROR_STOP on
\connect partner_db

BEGIN;

-- 근거 문서의 판별식을 그대로 고정한다.
CREATE TEMP TABLE qa_partner_targets ON COMMIT DROP AS
SELECT id
FROM partners
WHERE NOT is_deleted
  AND partner_code ~ '^SOL1154R20-BULK-[0-9]+$'
  AND biz_no = partner_code
  AND created_at >= TIMESTAMP '2026-08-10 01:24:06'
  AND created_at < TIMESTAMP '2026-08-10 01:24:14';

SELECT COUNT(*) AS partner_before,
       COUNT(*) = 1000 AS partner_count_ok
FROM qa_partner_targets
\gset

\if :partner_count_ok
  SELECT 'partner_db.partners before' AS measure, COUNT(*) AS rows
  FROM partners p JOIN qa_partner_targets t ON t.id = p.id;
\else
  \echo '예상치 불일치: partner 대상이 1,000행이 아니므로 롤백합니다.'
  ROLLBACK;
  \quit 1
\endif

UPDATE partners p
SET is_deleted = TRUE,
    deleted_at = CURRENT_TIMESTAMP,
    deleted_by = 'qa-residue-softdelete-2026-08-12',
    deleted_by_name = 'QA residue soft-delete'
FROM qa_partner_targets t
WHERE p.id = t.id
  AND NOT p.is_deleted;

SELECT COUNT(*) AS partner_after,
       COUNT(*) = 1000 AS partner_after_ok
FROM partners p JOIN qa_partner_targets t ON t.id = p.id
WHERE p.is_deleted
\gset

\if :partner_after_ok
  SELECT 'partner_db.partners after' AS measure, COUNT(*) AS rows
  FROM partners p JOIN qa_partner_targets t ON t.id = p.id
  WHERE p.is_deleted;
  COMMIT;
\else
  \echo '사후 건수 불일치: partner 대상 변경을 롤백합니다.'
  ROLLBACK;
  \quit 1
\endif

\connect slip_db
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
                             AND TIMESTAMP '2026-05-30 13:39:39.203575')
    OR l.product_id IN (
      '57dc63e2-43da-43e6-b73e-3c81822cf9a7',
      '7de11ab7-e70c-421e-80a4-7c6b51a2c6e9',
      'ed278526-0e16-427d-8a92-2ca06164254a'
    )
  );

CREATE TEMP TABLE qa_slip_targets ON COMMIT DROP AS
SELECT DISTINCT s.id
FROM slips s JOIN qa_slip_line_candidates c ON c.slip_id = s.id
WHERE NOT s.is_deleted;

CREATE TEMP TABLE qa_line_targets ON COMMIT DROP AS
SELECT l.id
FROM slip_lines l JOIN qa_slip_targets s ON s.id = l.slip_id
WHERE NOT l.is_deleted;

SELECT (SELECT COUNT(*) FROM qa_slip_targets) AS slip_before,
       (SELECT COUNT(*) FROM qa_line_targets) AS line_before,
       (SELECT COUNT(*) FROM qa_slip_targets) = 295
       AND (SELECT COUNT(*) FROM qa_line_targets) = 636 AS counts_ok
\gset

\if :counts_ok
  SELECT 'slip_db.slips before' AS measure, COUNT(*) AS rows
  FROM slips s JOIN qa_slip_targets t ON t.id = s.id;
  SELECT 'slip_db.slip_lines before' AS measure, COUNT(*) AS rows
  FROM slip_lines l JOIN qa_line_targets t ON t.id = l.id;
\else
  \echo '예상치 불일치: active 전표 295행 또는 active 라인 636행이 아니므로 롤백합니다.'
  ROLLBACK;
  \quit 1
\endif

UPDATE slip_lines l
SET is_deleted = TRUE,
    deleted_at = CURRENT_TIMESTAMP,
    deleted_by = 'qa-residue-softdelete-2026-08-12'
FROM qa_line_targets t
WHERE l.id = t.id
  AND NOT l.is_deleted;

UPDATE slips s
SET is_deleted = TRUE,
    deleted_at = CURRENT_TIMESTAMP,
    deleted_by = 'qa-residue-softdelete-2026-08-12',
    deleted_by_name = 'QA residue soft-delete'
FROM qa_slip_targets t
WHERE s.id = t.id
  AND NOT s.is_deleted;

SELECT (SELECT COUNT(*) FROM slips s JOIN qa_slip_targets t ON t.id = s.id WHERE s.is_deleted) AS slip_after,
       (SELECT COUNT(*) FROM slip_lines l JOIN qa_line_targets t ON t.id = l.id WHERE l.is_deleted) AS line_after,
       (SELECT COUNT(*) FROM slips s JOIN qa_slip_targets t ON t.id = s.id WHERE s.is_deleted) = 295
       AND (SELECT COUNT(*) FROM slip_lines l JOIN qa_line_targets t ON t.id = l.id WHERE l.is_deleted) = 636 AS after_ok
\gset

\if :after_ok
  SELECT 'slip_db.slips after' AS measure, COUNT(*) AS rows
  FROM slips s JOIN qa_slip_targets t ON t.id = s.id WHERE s.is_deleted;
  SELECT 'slip_db.slip_lines after' AS measure, COUNT(*) AS rows
  FROM slip_lines l JOIN qa_line_targets t ON t.id = l.id WHERE l.is_deleted;
  COMMIT;
\else
  \echo '사후 건수 불일치: slip 전표/라인 변경을 롤백합니다.'
  ROLLBACK;
  \quit 1
\endif
