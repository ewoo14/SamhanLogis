-- V12: SAS purchase_slip 권한 시드
-- role_page_permissions schema: role_code/page_code + BaseEntity audit columns.

INSERT INTO role_page_permissions
  (role_code, page_code, can_view, can_edit,
   created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
  ('ACCOUNTANT', 'accounting.purchase-slip.list', TRUE, TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',    'accounting.purchase-slip.list', TRUE, TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MASTER',     'accounting.purchase-slip.list', TRUE, TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',      'accounting.purchase-slip.list', TRUE, FALSE, NOW(), 'system', NOW(), 'system', FALSE)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING;
