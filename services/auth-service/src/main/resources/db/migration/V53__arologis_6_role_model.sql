-- V53__arologis_6_role_model.sql
-- 아로로지스 6-롤 모델 확장 (개발책임자 지시 2026-06-08).
--
-- arologis 권한 롤 = 마스터/매니저/개발자/영업사원/회계사원/배송기사 6롤만.
-- DynamicPermissionClientConfig 가 AROLOGIS_* → 중앙 코드(MASTER/MANAGER/DEVELOPER/
-- SALES/ACCOUNTANT/DRIVER)로 정규화하므로 중앙 role_code 로 적재한다.
--
-- (1) Samhan 공용 시드(V10/V34/V50/V51) 잔재인 무관 5롤의 arologis.* grant 제거.
--     어떤 arologis 사용자도 이 롤을 보유하지 못하므로 dead row(권한 매트릭스 노이즈).
-- (2) 유지 4롤(DEVELOPER/SALES/ACCOUNTANT/DRIVER)의 arologis.* grant 를 결정적 상태로 재적재
--     (V10 blanket 시드가 page 별로 불일치 → 전 page 명시 재seed). MASTER/MANAGER 행 불변.
--
-- 기본 grant(보수적·유용, 마스터가 권한 관리 매트릭스 UI 로 즉시 조정):
--   개발자   = 인사(HR)·권한관리 제외 전권(V/E) — 개발책임자 2026-06-08: 개발자는 직원
--              생성/롤변경 불가(권한 전파 차단, 기술 운영 역할). HR 주체는 마스터/매니저.
--   영업사원 = 배차/지역 조회(V)
--   회계사원 = 회계(현금출납/집계) V/E
--   배송기사 = 기사앱(arologis.driver) V/E

-- (1) 무관 5롤 제거 (배차담당자/재고원/협력사/사원/창고원)
DELETE FROM role_page_permissions
 WHERE page_code LIKE 'arologis.%'
   AND role_code IN ('DISPATCH', 'INVENTORY', 'PARTNER', 'STAFF', 'WAREHOUSE');

-- (2) 유지 4롤 결정적 재적재 — 기존 행 제거 후 전 page 명시 INSERT
DELETE FROM role_page_permissions
 WHERE page_code LIKE 'arologis.%'
   AND role_code IN ('DEVELOPER', 'SALES', 'ACCOUNTANT', 'DRIVER');

INSERT INTO role_page_permissions
  (role_code, page_code, can_view, can_edit,
   created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
  -- ── 개발자(DEVELOPER) — 권한관리 외 전권 ──────────────────────────────
  ('DEVELOPER', 'arologis.admin',                TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('DEVELOPER', 'arologis.region',               TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('DEVELOPER', 'arologis.dispatch.admin',       TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('DEVELOPER', 'arologis.dispatch.ops',         TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('DEVELOPER', 'arologis.region.manage',        TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('DEVELOPER', 'arologis.edit-requests',        TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('DEVELOPER', 'arologis.edit-requests.decide', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('DEVELOPER', 'arologis.driver',               TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  -- 인사(HR)는 개발자 제외 — 직원 생성/롤변경 권한 전파 차단(개발책임자 2026-06-08).
  ('DEVELOPER', 'arologis.hr.employees',         FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DEVELOPER', 'arologis.hr.departments',       FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DEVELOPER', 'arologis.accounting.cashbook',  TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('DEVELOPER', 'arologis.accounting.summary',   TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('DEVELOPER', 'arologis.admin.permissions',    FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ── 영업사원(SALES) — 배차/지역 조회(view) ───────────────────────────
  ('SALES',     'arologis.admin',                TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'arologis.region',               TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'arologis.dispatch.admin',       TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'arologis.dispatch.ops',         TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'arologis.region.manage',        FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'arologis.edit-requests',        FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'arologis.edit-requests.decide', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'arologis.driver',               FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'arologis.hr.employees',         FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'arologis.hr.departments',       FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'arologis.accounting.cashbook',  FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'arologis.accounting.summary',   FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'arologis.admin.permissions',    FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ── 회계사원(ACCOUNTANT) — 회계 전용(V/E) ────────────────────────────
  ('ACCOUNTANT','arologis.admin',                FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','arologis.region',               FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','arologis.dispatch.admin',       FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','arologis.dispatch.ops',         FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','arologis.region.manage',        FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','arologis.edit-requests',        FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','arologis.edit-requests.decide', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','arologis.driver',               FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','arologis.hr.employees',         FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','arologis.hr.departments',       FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','arologis.accounting.cashbook',  TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','arologis.accounting.summary',   TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','arologis.admin.permissions',    FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ── 배송기사(DRIVER) — 기사앱(arologis.driver) 전용 ──────────────────
  ('DRIVER',    'arologis.admin',                FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DRIVER',    'arologis.region',               FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DRIVER',    'arologis.dispatch.admin',       FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DRIVER',    'arologis.dispatch.ops',         FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DRIVER',    'arologis.region.manage',        FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DRIVER',    'arologis.edit-requests',        FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DRIVER',    'arologis.edit-requests.decide', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DRIVER',    'arologis.driver',               TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('DRIVER',    'arologis.hr.employees',         FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DRIVER',    'arologis.hr.departments',       FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DRIVER',    'arologis.accounting.cashbook',  FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DRIVER',    'arologis.accounting.summary',   FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DRIVER',    'arologis.admin.permissions',    FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE);
