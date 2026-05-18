-- V10__sp_d4_remaining_domains_page_permissions.sql
-- SP-D4 잔여 7 도메인 22 PageCode × 7 ROLE = 154 seed row
--
-- 역할: MASTER / MANAGER / ACCOUNTANT / SALES / WAREHOUSE / DISPATCH / INVENTORY
-- 도메인: 견적 / 거래처주문 / 재고 / 직원관리 / 거래처 / 상품 / 아로로지스
--
-- V/E 매트릭스 근거: docs/planning/2026-05-18_sp-d4-remaining-pages-permission-migration.md §2
--
-- BaseEntity 7 audit 필드 + is_deleted=FALSE 명시.
-- ON CONFLICT 안전장치: (role_code, page_code) WHERE is_deleted = FALSE 부분 유니크 인덱스 존재.
-- 재실행 시 동일 row 충돌 → DO NOTHING (멱등성 보장).

INSERT INTO role_page_permissions
  (role_code, page_code, can_view, can_edit,
   created_at, created_by, modified_at, modified_by, is_deleted)
VALUES

  -- ================================================================
  -- estimates.list — 견적 목록 (slip-service EstimateController)
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:V, SALES:V/E, WAREHOUSE:-, DISPATCH:-, INVENTORY:-
  -- ================================================================
  ('MASTER',    'estimates.list', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'estimates.list', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','estimates.list', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'estimates.list', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'estimates.list', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'estimates.list', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'estimates.list', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- sales.partner-order.list — 거래처주문 목록
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:V, SALES:V/E, WAREHOUSE:-, DISPATCH:-, INVENTORY:-
  -- ================================================================
  ('MASTER',    'sales.partner-order.list', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'sales.partner-order.list', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','sales.partner-order.list', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'sales.partner-order.list', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'sales.partner-order.list', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'sales.partner-order.list', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'sales.partner-order.list', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- sales.partner-order.draft — 거래처주문 작성/임시저장/수정/삭제/견적→주문
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:-, SALES:V/E, WAREHOUSE:-, DISPATCH:-, INVENTORY:-
  -- ================================================================
  ('MASTER',    'sales.partner-order.draft', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'sales.partner-order.draft', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','sales.partner-order.draft', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'sales.partner-order.draft', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'sales.partner-order.draft', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'sales.partner-order.draft', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'sales.partner-order.draft', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- sales.partner-order.confirm — 주문 확정/편집요청
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:-, SALES:V/E, WAREHOUSE:-, DISPATCH:-, INVENTORY:-
  -- ================================================================
  ('MASTER',    'sales.partner-order.confirm', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'sales.partner-order.confirm', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','sales.partner-order.confirm', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'sales.partner-order.confirm', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'sales.partner-order.confirm', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'sales.partner-order.confirm', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'sales.partner-order.confirm', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- sales.partner-order.history — 주문 이력/감사로그
  -- MASTER:V/E, MANAGER:V, ACCOUNTANT:V, SALES:V, WAREHOUSE:-, DISPATCH:-, INVENTORY:-
  -- ================================================================
  ('MASTER',    'sales.partner-order.history', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'sales.partner-order.history', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','sales.partner-order.history', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'sales.partner-order.history', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'sales.partner-order.history', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'sales.partner-order.history', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'sales.partner-order.history', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- sales.partner-order.print — 주문서 인쇄
  -- MASTER:V/E, MANAGER:V, ACCOUNTANT:-, SALES:V/E, WAREHOUSE:V, DISPATCH:-, INVENTORY:-
  -- ================================================================
  ('MASTER',    'sales.partner-order.print', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'sales.partner-order.print', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','sales.partner-order.print', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'sales.partner-order.print', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'sales.partner-order.print', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'sales.partner-order.print', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'sales.partner-order.print', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- sales.vendor-order — 벤더(외주) 발주서
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:-, SALES:V/E, WAREHOUSE:V, DISPATCH:-, INVENTORY:-
  -- ================================================================
  ('MASTER',    'sales.vendor-order', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'sales.vendor-order', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','sales.vendor-order', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'sales.vendor-order', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'sales.vendor-order', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'sales.vendor-order', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'sales.vendor-order', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- inventory.warehouse — 창고 관리
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:-, SALES:-, WAREHOUSE:V/E, DISPATCH:-, INVENTORY:V/E
  -- ================================================================
  ('MASTER',    'inventory.warehouse', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'inventory.warehouse', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','inventory.warehouse', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'inventory.warehouse', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'inventory.warehouse', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'inventory.warehouse', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'inventory.warehouse', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- inventory.stock — 재고 현황/안전재고
  -- MASTER:V/E, MANAGER:V, ACCOUNTANT:V, SALES:V, WAREHOUSE:V/E, DISPATCH:V, INVENTORY:V/E
  -- ================================================================
  ('MASTER',    'inventory.stock', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'inventory.stock', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','inventory.stock', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'inventory.stock', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'inventory.stock', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'inventory.stock', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'inventory.stock', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- inventory.stock-transfer — 재고 이동
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:-, SALES:-, WAREHOUSE:V/E, DISPATCH:-, INVENTORY:V/E
  -- ================================================================
  ('MASTER',    'inventory.stock-transfer', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'inventory.stock-transfer', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','inventory.stock-transfer', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'inventory.stock-transfer', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'inventory.stock-transfer', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'inventory.stock-transfer', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'inventory.stock-transfer', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- inventory.dps — DPS 비교/이력
  -- MASTER:V/E, MANAGER:V, ACCOUNTANT:-, SALES:-, WAREHOUSE:V/E, DISPATCH:-, INVENTORY:V/E
  -- ================================================================
  ('MASTER',    'inventory.dps', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'inventory.dps', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','inventory.dps', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'inventory.dps', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'inventory.dps', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'inventory.dps', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'inventory.dps', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- inventory.audit — 재고 감사
  -- MASTER:V/E, MANAGER:V, ACCOUNTANT:V, SALES:-, WAREHOUSE:V, DISPATCH:-, INVENTORY:V
  -- ================================================================
  ('MASTER',    'inventory.audit', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'inventory.audit', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','inventory.audit', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'inventory.audit', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'inventory.audit', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'inventory.audit', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'inventory.audit', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- admin.employees — 직원 관리
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:-, SALES:-, WAREHOUSE:-, DISPATCH:-, INVENTORY:-
  -- ================================================================
  ('MASTER',    'admin.employees', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'admin.employees', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','admin.employees', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'admin.employees', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'admin.employees', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'admin.employees', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'admin.employees', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- admin.users — 계정 관리
  -- MASTER:V/E, MANAGER:-, ACCOUNTANT:-, SALES:-, WAREHOUSE:-, DISPATCH:-, INVENTORY:-
  -- ================================================================
  ('MASTER',    'admin.users', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'admin.users', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','admin.users', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'admin.users', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'admin.users', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'admin.users', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'admin.users', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- partners.list — 거래처 목록
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:V, SALES:V/E, WAREHOUSE:-, DISPATCH:-, INVENTORY:-
  -- ================================================================
  ('MASTER',    'partners.list', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'partners.list', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','partners.list', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'partners.list', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'partners.list', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'partners.list', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'partners.list', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- partners.detail — 거래처 4탭 상세
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:V, SALES:V/E, WAREHOUSE:-, DISPATCH:-, INVENTORY:-
  -- ================================================================
  ('MASTER',    'partners.detail', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'partners.detail', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','partners.detail', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'partners.detail', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'partners.detail', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'partners.detail', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'partners.detail', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- partners.block — 거래처 차단
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:-, SALES:-, WAREHOUSE:-, DISPATCH:-, INVENTORY:-
  -- ================================================================
  ('MASTER',    'partners.block', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'partners.block', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','partners.block', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'partners.block', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'partners.block', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'partners.block', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'partners.block', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- partners.edit-request — 거래처 편집 결재
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:-, SALES:V, WAREHOUSE:-, DISPATCH:-, INVENTORY:-
  -- ================================================================
  ('MASTER',    'partners.edit-request', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'partners.edit-request', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','partners.edit-request', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'partners.edit-request', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'partners.edit-request', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'partners.edit-request', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'partners.edit-request', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- products.list — 상품 목록
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:V, SALES:V, WAREHOUSE:V, DISPATCH:-, INVENTORY:V
  -- ================================================================
  ('MASTER',    'products.list', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'products.list', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','products.list', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'products.list', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'products.list', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'products.list', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'products.list', TRUE,  FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- products.admin — 상품 관리(카테고리 편집)
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:-, SALES:V/E, WAREHOUSE:-, DISPATCH:-, INVENTORY:V/E
  -- ================================================================
  ('MASTER',    'products.admin', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'products.admin', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','products.admin', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'products.admin', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'products.admin', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'products.admin', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'products.admin', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- arologis.admin — 아로로지스 배차 관리
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:-, SALES:-, WAREHOUSE:-, DISPATCH:V/E, INVENTORY:-
  -- ================================================================
  ('MASTER',    'arologis.admin', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'arologis.admin', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','arologis.admin', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'arologis.admin', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'arologis.admin', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'arologis.admin', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'arologis.admin', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),

  -- ================================================================
  -- arologis.region — 아로로지스 지역/구역 관리
  -- MASTER:V/E, MANAGER:V/E, ACCOUNTANT:-, SALES:-, WAREHOUSE:-, DISPATCH:V/E, INVENTORY:-
  -- ================================================================
  ('MASTER',    'arologis.region', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',   'arologis.region', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT','arologis.region', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',     'arologis.region', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('WAREHOUSE', 'arologis.region', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DISPATCH',  'arologis.region', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('INVENTORY', 'arologis.region', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE)

ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING;
