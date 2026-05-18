-- V7__add_role_page_permissions.sql
-- SP-D1 동적 RBAC — role_page_permissions 테이블 생성 + 초기 12개 페이지 × 7 역할 seed.
--
-- 전략: 마스터가 override 한 row 가 존재하면 DB 권한 우선 적용,
--       없으면 서비스 레이어 기본 정책(fallback) 유지.
--       기존 @PreAuthorize 는 보존 — 이 테이블은 '추가 override' 레이어.
--
-- Legacy 호환: 신규 테이블만 생성. 기존 accounts 테이블 변경 없음.
-- NULLable audit 컬럼: created_by / modified_by 는 NOT NULL 이지만
--   seed INSERT 에서 'system' 으로 채움.
--
-- pgcrypto 확장: gen_random_uuid() 사용을 위해 확장 활성화.
-- IF NOT EXISTS 이므로 기존 환경에서 재실행 시 오류 없음.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS role_page_permissions (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    role_code       VARCHAR(20) NOT NULL,
    page_code       VARCHAR(100) NOT NULL,
    can_view        BOOLEAN     NOT NULL DEFAULT FALSE,
    can_edit        BOOLEAN     NOT NULL DEFAULT FALSE,
    -- BaseEntity 7 audit fields
    created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(50) NOT NULL DEFAULT 'system',
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
    CONSTRAINT role_page_permissions_pk PRIMARY KEY (id)
);

-- 활성 row 에 대해 (role_code, page_code) 유니크 제약 (부분 인덱스로 구현)
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_page_permissions_active
    ON role_page_permissions (role_code, page_code)
    WHERE is_deleted = FALSE;

-- 조회 성능용 인덱스
CREATE INDEX IF NOT EXISTS idx_rpp_role_code ON role_page_permissions (role_code) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_rpp_page_code ON role_page_permissions (page_code) WHERE is_deleted = FALSE;

-- =========================================================
-- [DEV-SEED] 초기 권한 매트릭스 — 12개 페이지 × 7 역할
-- SP-03 §4.2 기본 권한 + SP-09 vendor 4개 페이지 기반
-- 역할: MASTER / MANAGER / ACCOUNTANT / SALES / WAREHOUSE / DISPATCH / INVENTORY
-- =========================================================

-- page_code 목록:
--   accounting.tax-invoice.emit-nts   — NTS e-Tax 발행
--   accounting.tax-invoice.list       — 세금계산서 목록
--   accounting.deposit-match          — 입금 매칭
--   accounting.daily-closing          — 일마감
--   accounting.general-ledger         — 원장
--   notification.dispatch-sms.send-audit — SMS 발송 이력
--   purchases.receipt-ocr             — OCR 영수증
--   purchases.slip.list               — 매입 슬립 목록
--   sales.slip.list                   — 매출 슬립 목록
--   inbound.inspection                — 입고 검수
--   dispatch.board                    — 배차 보드
--   admin.permissions                 — 권한 관리 (MASTER 전용)

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
-- ---- MASTER: 전체 허용 ----
('d1000001-0000-0000-0000-000000000001', 'MASTER', 'accounting.tax-invoice.emit-nts',      TRUE, TRUE,  NOW(), 'system', FALSE),
('d1000001-0000-0000-0000-000000000002', 'MASTER', 'accounting.tax-invoice.list',           TRUE, TRUE,  NOW(), 'system', FALSE),
('d1000001-0000-0000-0000-000000000003', 'MASTER', 'accounting.deposit-match',              TRUE, TRUE,  NOW(), 'system', FALSE),
('d1000001-0000-0000-0000-000000000004', 'MASTER', 'accounting.daily-closing',              TRUE, TRUE,  NOW(), 'system', FALSE),
('d1000001-0000-0000-0000-000000000005', 'MASTER', 'accounting.general-ledger',             TRUE, TRUE,  NOW(), 'system', FALSE),
('d1000001-0000-0000-0000-000000000006', 'MASTER', 'notification.dispatch-sms.send-audit', TRUE, TRUE,  NOW(), 'system', FALSE),
('d1000001-0000-0000-0000-000000000007', 'MASTER', 'purchases.receipt-ocr',                TRUE, TRUE,  NOW(), 'system', FALSE),
('d1000001-0000-0000-0000-000000000008', 'MASTER', 'purchases.slip.list',                  TRUE, TRUE,  NOW(), 'system', FALSE),
('d1000001-0000-0000-0000-000000000009', 'MASTER', 'sales.slip.list',                      TRUE, TRUE,  NOW(), 'system', FALSE),
('d1000001-0000-0000-0000-000000000010', 'MASTER', 'inbound.inspection',                   TRUE, TRUE,  NOW(), 'system', FALSE),
('d1000001-0000-0000-0000-000000000011', 'MASTER', 'dispatch.board',                       TRUE, TRUE,  NOW(), 'system', FALSE),
('d1000001-0000-0000-0000-000000000012', 'MASTER', 'admin.permissions',                    TRUE, TRUE,  NOW(), 'system', FALSE),

-- ---- MANAGER: 대부분 허용 (권한 관리 화면 제외) ----
('d1000002-0000-0000-0000-000000000001', 'MANAGER', 'accounting.tax-invoice.emit-nts',      FALSE, FALSE, NOW(), 'system', FALSE),
('d1000002-0000-0000-0000-000000000002', 'MANAGER', 'accounting.tax-invoice.list',           TRUE,  FALSE, NOW(), 'system', FALSE),
('d1000002-0000-0000-0000-000000000003', 'MANAGER', 'accounting.deposit-match',              TRUE,  FALSE, NOW(), 'system', FALSE),
('d1000002-0000-0000-0000-000000000004', 'MANAGER', 'accounting.daily-closing',              TRUE,  FALSE, NOW(), 'system', FALSE),
('d1000002-0000-0000-0000-000000000005', 'MANAGER', 'accounting.general-ledger',             TRUE,  FALSE, NOW(), 'system', FALSE),
('d1000002-0000-0000-0000-000000000006', 'MANAGER', 'notification.dispatch-sms.send-audit', TRUE,  FALSE, NOW(), 'system', FALSE),
('d1000002-0000-0000-0000-000000000007', 'MANAGER', 'purchases.receipt-ocr',                TRUE,  FALSE, NOW(), 'system', FALSE),
('d1000002-0000-0000-0000-000000000008', 'MANAGER', 'purchases.slip.list',                  TRUE,  FALSE, NOW(), 'system', FALSE),
('d1000002-0000-0000-0000-000000000009', 'MANAGER', 'sales.slip.list',                      TRUE,  FALSE, NOW(), 'system', FALSE),
('d1000002-0000-0000-0000-000000000010', 'MANAGER', 'inbound.inspection',                   TRUE,  FALSE, NOW(), 'system', FALSE),
('d1000002-0000-0000-0000-000000000011', 'MANAGER', 'dispatch.board',                       TRUE,  FALSE, NOW(), 'system', FALSE),
('d1000002-0000-0000-0000-000000000012', 'MANAGER', 'admin.permissions',                    FALSE, FALSE, NOW(), 'system', FALSE),

-- ---- ACCOUNTANT: 회계 화면 편집 허용 ----
('d1000003-0000-0000-0000-000000000001', 'ACCOUNTANT', 'accounting.tax-invoice.emit-nts',      TRUE,  TRUE,  NOW(), 'system', FALSE),
('d1000003-0000-0000-0000-000000000002', 'ACCOUNTANT', 'accounting.tax-invoice.list',           TRUE,  TRUE,  NOW(), 'system', FALSE),
('d1000003-0000-0000-0000-000000000003', 'ACCOUNTANT', 'accounting.deposit-match',              TRUE,  TRUE,  NOW(), 'system', FALSE),
('d1000003-0000-0000-0000-000000000004', 'ACCOUNTANT', 'accounting.daily-closing',              TRUE,  TRUE,  NOW(), 'system', FALSE),
('d1000003-0000-0000-0000-000000000005', 'ACCOUNTANT', 'accounting.general-ledger',             TRUE,  FALSE, NOW(), 'system', FALSE),
('d1000003-0000-0000-0000-000000000006', 'ACCOUNTANT', 'notification.dispatch-sms.send-audit', FALSE, FALSE, NOW(), 'system', FALSE),
('d1000003-0000-0000-0000-000000000007', 'ACCOUNTANT', 'purchases.receipt-ocr',                TRUE,  TRUE,  NOW(), 'system', FALSE),
('d1000003-0000-0000-0000-000000000008', 'ACCOUNTANT', 'purchases.slip.list',                  TRUE,  FALSE, NOW(), 'system', FALSE),
('d1000003-0000-0000-0000-000000000009', 'ACCOUNTANT', 'sales.slip.list',                      TRUE,  FALSE, NOW(), 'system', FALSE),
('d1000003-0000-0000-0000-000000000010', 'ACCOUNTANT', 'inbound.inspection',                   FALSE, FALSE, NOW(), 'system', FALSE),
('d1000003-0000-0000-0000-000000000011', 'ACCOUNTANT', 'dispatch.board',                       FALSE, FALSE, NOW(), 'system', FALSE),
('d1000003-0000-0000-0000-000000000012', 'ACCOUNTANT', 'admin.permissions',                    FALSE, FALSE, NOW(), 'system', FALSE),

-- ---- SALES: 영업 화면 위주 ----
('d1000004-0000-0000-0000-000000000001', 'SALES', 'accounting.tax-invoice.emit-nts',      FALSE, FALSE, NOW(), 'system', FALSE),
('d1000004-0000-0000-0000-000000000002', 'SALES', 'accounting.tax-invoice.list',           TRUE,  FALSE, NOW(), 'system', FALSE),
('d1000004-0000-0000-0000-000000000003', 'SALES', 'accounting.deposit-match',              FALSE, FALSE, NOW(), 'system', FALSE),
('d1000004-0000-0000-0000-000000000004', 'SALES', 'accounting.daily-closing',              FALSE, FALSE, NOW(), 'system', FALSE),
('d1000004-0000-0000-0000-000000000005', 'SALES', 'accounting.general-ledger',             FALSE, FALSE, NOW(), 'system', FALSE),
('d1000004-0000-0000-0000-000000000006', 'SALES', 'notification.dispatch-sms.send-audit', FALSE, FALSE, NOW(), 'system', FALSE),
('d1000004-0000-0000-0000-000000000007', 'SALES', 'purchases.receipt-ocr',                FALSE, FALSE, NOW(), 'system', FALSE),
('d1000004-0000-0000-0000-000000000008', 'SALES', 'purchases.slip.list',                  FALSE, FALSE, NOW(), 'system', FALSE),
('d1000004-0000-0000-0000-000000000009', 'SALES', 'sales.slip.list',                      TRUE,  TRUE,  NOW(), 'system', FALSE),
('d1000004-0000-0000-0000-000000000010', 'SALES', 'inbound.inspection',                   FALSE, FALSE, NOW(), 'system', FALSE),
('d1000004-0000-0000-0000-000000000011', 'SALES', 'dispatch.board',                       TRUE,  FALSE, NOW(), 'system', FALSE),
('d1000004-0000-0000-0000-000000000012', 'SALES', 'admin.permissions',                    FALSE, FALSE, NOW(), 'system', FALSE),

-- ---- WAREHOUSE: 창고 화면 위주 ----
('d1000005-0000-0000-0000-000000000001', 'WAREHOUSE', 'accounting.tax-invoice.emit-nts',      FALSE, FALSE, NOW(), 'system', FALSE),
('d1000005-0000-0000-0000-000000000002', 'WAREHOUSE', 'accounting.tax-invoice.list',           FALSE, FALSE, NOW(), 'system', FALSE),
('d1000005-0000-0000-0000-000000000003', 'WAREHOUSE', 'accounting.deposit-match',              FALSE, FALSE, NOW(), 'system', FALSE),
('d1000005-0000-0000-0000-000000000004', 'WAREHOUSE', 'accounting.daily-closing',              FALSE, FALSE, NOW(), 'system', FALSE),
('d1000005-0000-0000-0000-000000000005', 'WAREHOUSE', 'accounting.general-ledger',             FALSE, FALSE, NOW(), 'system', FALSE),
('d1000005-0000-0000-0000-000000000006', 'WAREHOUSE', 'notification.dispatch-sms.send-audit', FALSE, FALSE, NOW(), 'system', FALSE),
('d1000005-0000-0000-0000-000000000007', 'WAREHOUSE', 'purchases.receipt-ocr',                FALSE, FALSE, NOW(), 'system', FALSE),
('d1000005-0000-0000-0000-000000000008', 'WAREHOUSE', 'purchases.slip.list',                  TRUE,  FALSE, NOW(), 'system', FALSE),
('d1000005-0000-0000-0000-000000000009', 'WAREHOUSE', 'sales.slip.list',                      TRUE,  FALSE, NOW(), 'system', FALSE),
('d1000005-0000-0000-0000-000000000010', 'WAREHOUSE', 'inbound.inspection',                   TRUE,  TRUE,  NOW(), 'system', FALSE),
('d1000005-0000-0000-0000-000000000011', 'WAREHOUSE', 'dispatch.board',                       FALSE, FALSE, NOW(), 'system', FALSE),
('d1000005-0000-0000-0000-000000000012', 'WAREHOUSE', 'admin.permissions',                    FALSE, FALSE, NOW(), 'system', FALSE),

-- ---- DISPATCH: 배차 화면 위주 ----
('d1000006-0000-0000-0000-000000000001', 'DISPATCH', 'accounting.tax-invoice.emit-nts',      FALSE, FALSE, NOW(), 'system', FALSE),
('d1000006-0000-0000-0000-000000000002', 'DISPATCH', 'accounting.tax-invoice.list',           FALSE, FALSE, NOW(), 'system', FALSE),
('d1000006-0000-0000-0000-000000000003', 'DISPATCH', 'accounting.deposit-match',              FALSE, FALSE, NOW(), 'system', FALSE),
('d1000006-0000-0000-0000-000000000004', 'DISPATCH', 'accounting.daily-closing',              FALSE, FALSE, NOW(), 'system', FALSE),
('d1000006-0000-0000-0000-000000000005', 'DISPATCH', 'accounting.general-ledger',             FALSE, FALSE, NOW(), 'system', FALSE),
('d1000006-0000-0000-0000-000000000006', 'DISPATCH', 'notification.dispatch-sms.send-audit', TRUE,  TRUE,  NOW(), 'system', FALSE),
('d1000006-0000-0000-0000-000000000007', 'DISPATCH', 'purchases.receipt-ocr',                FALSE, FALSE, NOW(), 'system', FALSE),
('d1000006-0000-0000-0000-000000000008', 'DISPATCH', 'purchases.slip.list',                  FALSE, FALSE, NOW(), 'system', FALSE),
('d1000006-0000-0000-0000-000000000009', 'DISPATCH', 'sales.slip.list',                      FALSE, FALSE, NOW(), 'system', FALSE),
('d1000006-0000-0000-0000-000000000010', 'DISPATCH', 'inbound.inspection',                   FALSE, FALSE, NOW(), 'system', FALSE),
('d1000006-0000-0000-0000-000000000011', 'DISPATCH', 'dispatch.board',                       TRUE,  TRUE,  NOW(), 'system', FALSE),
('d1000006-0000-0000-0000-000000000012', 'DISPATCH', 'admin.permissions',                    FALSE, FALSE, NOW(), 'system', FALSE),

-- ---- INVENTORY: 재고 화면 위주 ----
('d1000007-0000-0000-0000-000000000001', 'INVENTORY', 'accounting.tax-invoice.emit-nts',      FALSE, FALSE, NOW(), 'system', FALSE),
('d1000007-0000-0000-0000-000000000002', 'INVENTORY', 'accounting.tax-invoice.list',           FALSE, FALSE, NOW(), 'system', FALSE),
('d1000007-0000-0000-0000-000000000003', 'INVENTORY', 'accounting.deposit-match',              FALSE, FALSE, NOW(), 'system', FALSE),
('d1000007-0000-0000-0000-000000000004', 'INVENTORY', 'accounting.daily-closing',              FALSE, FALSE, NOW(), 'system', FALSE),
('d1000007-0000-0000-0000-000000000005', 'INVENTORY', 'accounting.general-ledger',             FALSE, FALSE, NOW(), 'system', FALSE),
('d1000007-0000-0000-0000-000000000006', 'INVENTORY', 'notification.dispatch-sms.send-audit', FALSE, FALSE, NOW(), 'system', FALSE),
('d1000007-0000-0000-0000-000000000007', 'INVENTORY', 'purchases.receipt-ocr',                FALSE, FALSE, NOW(), 'system', FALSE),
('d1000007-0000-0000-0000-000000000008', 'INVENTORY', 'purchases.slip.list',                  TRUE,  FALSE, NOW(), 'system', FALSE),
('d1000007-0000-0000-0000-000000000009', 'INVENTORY', 'sales.slip.list',                      TRUE,  FALSE, NOW(), 'system', FALSE),
('d1000007-0000-0000-0000-000000000010', 'INVENTORY', 'inbound.inspection',                   TRUE,  TRUE,  NOW(), 'system', FALSE),
('d1000007-0000-0000-0000-000000000011', 'INVENTORY', 'dispatch.board',                       FALSE, FALSE, NOW(), 'system', FALSE),
('d1000007-0000-0000-0000-000000000012', 'INVENTORY', 'admin.permissions',                    FALSE, FALSE, NOW(), 'system', FALSE)

ON CONFLICT DO NOTHING;
