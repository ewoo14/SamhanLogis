-- V52__seed_arologis_admin_permissions_page.sql
-- arologis-desktop 백오피스 Phase A: 권한 관리 매트릭스 page-code grant.
--
-- arologis.admin.permissions 는 아로로지스 MASTER 전용 기능(롤별 권한 view/edit 매트릭스 조회·할당).
-- arologis-service DynamicPermissionClientConfig 가 AROLOGIS_MASTER → MASTER 로 정규화하므로
-- 중앙 role code MASTER 에만 view/edit grant 를 부여하고, 나머지 롤은 모두 false 로 시드한다.
-- (권한 관리는 마스터 전용 — MANAGER 포함 비-MASTER 는 조회·할당 모두 불가.)
--
-- V50(HR)/V51(accounting) 과 동일한 role_page_permissions 기반 role-mode seed 포맷.

INSERT INTO role_page_permissions
  (role_code, page_code, can_view, can_edit,
   created_at, created_by, modified_at, modified_by, is_deleted)
VALUES

  -- ================================================================
  -- arologis.admin.permissions — 아로로지스 권한 관리(MASTER 전용)
  -- MASTER:V/E, MANAGER:-, ACCOUNTANT:-, SALES:-, WAREHOUSE:-, DISPATCH:-, INVENTORY:-
  -- ================================================================
  ('MASTER',    'arologis.admin.permissions', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'arologis.admin.permissions', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','arologis.admin.permissions', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'arologis.admin.permissions', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'arologis.admin.permissions', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'arologis.admin.permissions', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'arologis.admin.permissions', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE)

ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING;
