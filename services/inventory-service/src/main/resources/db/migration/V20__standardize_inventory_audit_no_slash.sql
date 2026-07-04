-- V20__standardize_inventory_audit_no_slash.sql
-- 재고 실사번호를 전표번호 표준 yyyy/MM/dd-N 으로 정규화한다.

DO $$
BEGIN
    IF EXISTS (
        WITH normalized AS (
            SELECT id,
                   CASE
                       WHEN audit_no LIKE 'AU-%'
                        AND audit_no ~ '^AU-[0-9]{8}-[0-9]+$'
                       THEN regexp_replace(
                               audit_no,
                               '^AU-([0-9]{4})([0-9]{2})([0-9]{2})-0*([0-9]+)$',
                               '\1/\2/\3-\4'
                            )
                       ELSE audit_no
                   END AS normalized_no
              FROM inventory_audits
             WHERE is_deleted = FALSE
        )
        SELECT 1
          FROM normalized
         GROUP BY normalized_no
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'inventory_audits.audit_no normalization would create active duplicates';
    END IF;
END $$;

UPDATE inventory_audits
   SET audit_no = regexp_replace(
           audit_no,
           '^AU-([0-9]{4})([0-9]{2})([0-9]{2})-0*([0-9]+)$',
           '\1/\2/\3-\4'
       )
 WHERE audit_no LIKE 'AU-%'
   AND audit_no ~ '^AU-[0-9]{8}-[0-9]+$';
