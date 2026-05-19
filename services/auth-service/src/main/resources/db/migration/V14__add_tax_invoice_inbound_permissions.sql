-- V14: SP-SAS-4 세금계산서 수신 권한 시드
-- ACCOUNTANT/MANAGER/MASTER edit, SALES 는 접근 차단.

INSERT INTO role_page_permissions
  (role_code, page_code, can_view, can_edit,
   created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
  ('ACCOUNTANT', 'accounting.tax-invoice.inbound', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',    'accounting.tax-invoice.inbound', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MASTER',     'accounting.tax-invoice.inbound', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',      'accounting.tax-invoice.inbound', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING;
