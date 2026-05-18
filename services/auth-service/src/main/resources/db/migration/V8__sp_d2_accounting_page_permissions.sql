-- V8__sp_d2_accounting_page_permissions.sql
-- SP-D2 회계 카테고리 PermissionGuard 일괄 적용 — 7개 신규 PageCode seed.
--
-- 신규 PageCode 목록 (회계 라우트 12개 그룹 → 7개 PageCode):
--   accounting.accounts       — 계정과목 트리
--   accounting.journals       — 분개장 목록/작성/상세
--   accounting.balances       — 시산표
--   accounting.reports        — 재무 보고서 (9종 + 인쇄 라우트)
--   accounting.period-close   — 월말 마감
--   accounting.statement-batch — 거래명세서 일괄
--   accounting.partner-ledger — 거래처 원장 / 홈택스 일괄 양식 / 사업자 양식
--
-- 역할별 기본 권한 정책:
--   MASTER      → 전체 허용 (view + edit)
--   MANAGER     → 전체 view 허용, edit 제한
--   ACCOUNTANT  → 전체 view + edit 허용 (회계 전담 역할)
--   SALES       → 모두 비허용 (회계 메뉴 미노출)
--   WAREHOUSE   → 모두 비허용
--   DISPATCH    → 모두 비허용
--   INVENTORY   → 모두 비허용
--
-- BaseEntity 7 audit fields 준수 (created_at / created_by / is_deleted 필수).
-- ON CONFLICT DO NOTHING — 이미 row 가 있는 환경에서 재실행 시 안전.

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
-- ======================================================
-- MASTER: 회계 신규 7개 페이지 전체 허용
-- ======================================================
('d2000001-0000-0000-0000-000000000001', 'MASTER', 'accounting.accounts',        TRUE, TRUE,  NOW(), 'system', FALSE),
('d2000001-0000-0000-0000-000000000002', 'MASTER', 'accounting.journals',        TRUE, TRUE,  NOW(), 'system', FALSE),
('d2000001-0000-0000-0000-000000000003', 'MASTER', 'accounting.balances',        TRUE, TRUE,  NOW(), 'system', FALSE),
('d2000001-0000-0000-0000-000000000004', 'MASTER', 'accounting.reports',         TRUE, TRUE,  NOW(), 'system', FALSE),
('d2000001-0000-0000-0000-000000000005', 'MASTER', 'accounting.period-close',    TRUE, TRUE,  NOW(), 'system', FALSE),
('d2000001-0000-0000-0000-000000000006', 'MASTER', 'accounting.statement-batch', TRUE, TRUE,  NOW(), 'system', FALSE),
('d2000001-0000-0000-0000-000000000007', 'MASTER', 'accounting.partner-ledger',  TRUE, TRUE,  NOW(), 'system', FALSE),

-- ======================================================
-- MANAGER: view 허용, edit 제한
-- ======================================================
('d2000002-0000-0000-0000-000000000001', 'MANAGER', 'accounting.accounts',        TRUE, FALSE, NOW(), 'system', FALSE),
('d2000002-0000-0000-0000-000000000002', 'MANAGER', 'accounting.journals',        TRUE, FALSE, NOW(), 'system', FALSE),
('d2000002-0000-0000-0000-000000000003', 'MANAGER', 'accounting.balances',        TRUE, FALSE, NOW(), 'system', FALSE),
('d2000002-0000-0000-0000-000000000004', 'MANAGER', 'accounting.reports',         TRUE, FALSE, NOW(), 'system', FALSE),
('d2000002-0000-0000-0000-000000000005', 'MANAGER', 'accounting.period-close',    TRUE, FALSE, NOW(), 'system', FALSE),
('d2000002-0000-0000-0000-000000000006', 'MANAGER', 'accounting.statement-batch', TRUE, FALSE, NOW(), 'system', FALSE),
('d2000002-0000-0000-0000-000000000007', 'MANAGER', 'accounting.partner-ledger',  TRUE, FALSE, NOW(), 'system', FALSE),

-- ======================================================
-- ACCOUNTANT: 회계 전담 — view + edit 전체 허용
-- ======================================================
('d2000003-0000-0000-0000-000000000001', 'ACCOUNTANT', 'accounting.accounts',        TRUE, TRUE,  NOW(), 'system', FALSE),
('d2000003-0000-0000-0000-000000000002', 'ACCOUNTANT', 'accounting.journals',        TRUE, TRUE,  NOW(), 'system', FALSE),
('d2000003-0000-0000-0000-000000000003', 'ACCOUNTANT', 'accounting.balances',        TRUE, FALSE, NOW(), 'system', FALSE),
('d2000003-0000-0000-0000-000000000004', 'ACCOUNTANT', 'accounting.reports',         TRUE, FALSE, NOW(), 'system', FALSE),
('d2000003-0000-0000-0000-000000000005', 'ACCOUNTANT', 'accounting.period-close',    TRUE, TRUE,  NOW(), 'system', FALSE),
('d2000003-0000-0000-0000-000000000006', 'ACCOUNTANT', 'accounting.statement-batch', TRUE, TRUE,  NOW(), 'system', FALSE),
('d2000003-0000-0000-0000-000000000007', 'ACCOUNTANT', 'accounting.partner-ledger',  TRUE, FALSE, NOW(), 'system', FALSE),

-- ======================================================
-- SALES: 회계 메뉴 비허용
-- ======================================================
('d2000004-0000-0000-0000-000000000001', 'SALES', 'accounting.accounts',        FALSE, FALSE, NOW(), 'system', FALSE),
('d2000004-0000-0000-0000-000000000002', 'SALES', 'accounting.journals',        FALSE, FALSE, NOW(), 'system', FALSE),
('d2000004-0000-0000-0000-000000000003', 'SALES', 'accounting.balances',        FALSE, FALSE, NOW(), 'system', FALSE),
('d2000004-0000-0000-0000-000000000004', 'SALES', 'accounting.reports',         FALSE, FALSE, NOW(), 'system', FALSE),
('d2000004-0000-0000-0000-000000000005', 'SALES', 'accounting.period-close',    FALSE, FALSE, NOW(), 'system', FALSE),
('d2000004-0000-0000-0000-000000000006', 'SALES', 'accounting.statement-batch', FALSE, FALSE, NOW(), 'system', FALSE),
('d2000004-0000-0000-0000-000000000007', 'SALES', 'accounting.partner-ledger',  FALSE, FALSE, NOW(), 'system', FALSE),

-- ======================================================
-- WAREHOUSE: 회계 메뉴 비허용
-- ======================================================
('d2000005-0000-0000-0000-000000000001', 'WAREHOUSE', 'accounting.accounts',        FALSE, FALSE, NOW(), 'system', FALSE),
('d2000005-0000-0000-0000-000000000002', 'WAREHOUSE', 'accounting.journals',        FALSE, FALSE, NOW(), 'system', FALSE),
('d2000005-0000-0000-0000-000000000003', 'WAREHOUSE', 'accounting.balances',        FALSE, FALSE, NOW(), 'system', FALSE),
('d2000005-0000-0000-0000-000000000004', 'WAREHOUSE', 'accounting.reports',         FALSE, FALSE, NOW(), 'system', FALSE),
('d2000005-0000-0000-0000-000000000005', 'WAREHOUSE', 'accounting.period-close',    FALSE, FALSE, NOW(), 'system', FALSE),
('d2000005-0000-0000-0000-000000000006', 'WAREHOUSE', 'accounting.statement-batch', FALSE, FALSE, NOW(), 'system', FALSE),
('d2000005-0000-0000-0000-000000000007', 'WAREHOUSE', 'accounting.partner-ledger',  FALSE, FALSE, NOW(), 'system', FALSE),

-- ======================================================
-- DISPATCH: 회계 메뉴 비허용
-- ======================================================
('d2000006-0000-0000-0000-000000000001', 'DISPATCH', 'accounting.accounts',        FALSE, FALSE, NOW(), 'system', FALSE),
('d2000006-0000-0000-0000-000000000002', 'DISPATCH', 'accounting.journals',        FALSE, FALSE, NOW(), 'system', FALSE),
('d2000006-0000-0000-0000-000000000003', 'DISPATCH', 'accounting.balances',        FALSE, FALSE, NOW(), 'system', FALSE),
('d2000006-0000-0000-0000-000000000004', 'DISPATCH', 'accounting.reports',         FALSE, FALSE, NOW(), 'system', FALSE),
('d2000006-0000-0000-0000-000000000005', 'DISPATCH', 'accounting.period-close',    FALSE, FALSE, NOW(), 'system', FALSE),
('d2000006-0000-0000-0000-000000000006', 'DISPATCH', 'accounting.statement-batch', FALSE, FALSE, NOW(), 'system', FALSE),
('d2000006-0000-0000-0000-000000000007', 'DISPATCH', 'accounting.partner-ledger',  FALSE, FALSE, NOW(), 'system', FALSE),

-- ======================================================
-- INVENTORY: 회계 메뉴 비허용
-- ======================================================
('d2000007-0000-0000-0000-000000000001', 'INVENTORY', 'accounting.accounts',        FALSE, FALSE, NOW(), 'system', FALSE),
('d2000007-0000-0000-0000-000000000002', 'INVENTORY', 'accounting.journals',        FALSE, FALSE, NOW(), 'system', FALSE),
('d2000007-0000-0000-0000-000000000003', 'INVENTORY', 'accounting.balances',        FALSE, FALSE, NOW(), 'system', FALSE),
('d2000007-0000-0000-0000-000000000004', 'INVENTORY', 'accounting.reports',         FALSE, FALSE, NOW(), 'system', FALSE),
('d2000007-0000-0000-0000-000000000005', 'INVENTORY', 'accounting.period-close',    FALSE, FALSE, NOW(), 'system', FALSE),
('d2000007-0000-0000-0000-000000000006', 'INVENTORY', 'accounting.statement-batch', FALSE, FALSE, NOW(), 'system', FALSE),
('d2000007-0000-0000-0000-000000000007', 'INVENTORY', 'accounting.partner-ledger',  FALSE, FALSE, NOW(), 'system', FALSE)

ON CONFLICT DO NOTHING;
