-- V50__seed_arologis_hr_page_permissions.sql
-- arologis-desktop 백오피스 Phase B: HR 직원/부서 page-code grant.
--
-- arologis.admin(V10)과 동일한 role_page_permissions 기반 role-mode seed.
-- arologis-service DynamicPermissionClientConfig 가 AROLOGIS_MASTER/MANAGER 를
-- MASTER/MANAGER 로 정규화하므로 중앙 role code 로만 적재한다.

INSERT INTO role_page_permissions
  (role_code, page_code, can_view, can_edit,
   created_at, created_by, modified_at, modified_by, is_deleted)
VALUES

  -- ================================================================
  -- arologis.hr.employees — 아로로지스 직원 관리
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:-, SALES:-, WAREHOUSE:-, DISPATCH:-, INVENTORY:-
  -- ================================================================
  ('MASTER',    'arologis.hr.employees', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'arologis.hr.employees', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','arologis.hr.employees', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'arologis.hr.employees', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'arologis.hr.employees', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'arologis.hr.employees', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'arologis.hr.employees', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- arologis.hr.departments — 아로로지스 부서 관리
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:-, SALES:-, WAREHOUSE:-, DISPATCH:-, INVENTORY:-
  -- ================================================================
  ('MASTER',    'arologis.hr.departments', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'arologis.hr.departments', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','arologis.hr.departments', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'arologis.hr.departments', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'arologis.hr.departments', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'arologis.hr.departments', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'arologis.hr.departments', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE)

ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING;
