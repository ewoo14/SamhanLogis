-- V13: SP-SAS-3 세금계산서 발행 묶음 권한 시드
-- 대량 발행 위험도 때문에 MASTER 만 edit, ACCOUNTANT 는 view-only.

INSERT INTO role_page_permissions
  (role_code, page_code, can_view, can_edit,
   created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
  ('ACCOUNTANT', 'accounting.tax-invoice.batch-issue', TRUE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('MASTER',     'accounting.tax-invoice.batch-issue', TRUE, TRUE,  NOW(), 'system', NOW(), 'system', FALSE)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING;
