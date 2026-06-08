-- V51__seed_arologis_accounting_page_permissions.sql
-- arologis-desktop 백오피스 Phase C: 간이 회계 cashbook/summary page-code grant.
--
-- V50(HR)과 동일한 role_page_permissions 기반 role-mode seed.
-- arologis-service DynamicPermissionClientConfig 가 AROLOGIS_MASTER/MANAGER 를
-- MASTER/MANAGER 로 정규화하므로 중앙 role code 로만 적재한다.

INSERT INTO role_page_permissions
  (role_code, page_code, can_view, can_edit,
   created_at, created_by, modified_at, modified_by, is_deleted)
VALUES

  -- ================================================================
  -- arologis.accounting.cashbook — 아로로지스 간이 현금출납장(CRUD)
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:-, SALES:-, WAREHOUSE:-, DISPATCH:-, INVENTORY:-
  -- ================================================================
  ('MASTER',    'arologis.accounting.cashbook', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'arologis.accounting.cashbook', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','arologis.accounting.cashbook', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'arologis.accounting.cashbook', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'arologis.accounting.cashbook', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'arologis.accounting.cashbook', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'arologis.accounting.cashbook', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- arologis.accounting.summary — 아로로지스 회계 월별 집계(VIEW)
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:-, SALES:-, WAREHOUSE:-, DISPATCH:-, INVENTORY:-
  -- ================================================================
  ('MASTER',    'arologis.accounting.summary', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'arologis.accounting.summary', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','arologis.accounting.summary', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'arologis.accounting.summary', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'arologis.accounting.summary', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'arologis.accounting.summary', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'arologis.accounting.summary', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE)

ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING;
