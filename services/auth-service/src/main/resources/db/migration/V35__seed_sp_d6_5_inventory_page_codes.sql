-- V35__seed_sp_d6_5_inventory_page_codes.sql
-- SP-D6-5 inventory-service @RequirePermission migration 신규 PageCode seed.
-- 기존 V10 inventory.warehouse / inventory.dps 는 보존하고, 신규 코드만 추가한다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

WITH roles(role_code) AS (
    VALUES
        ('MASTER'),
        ('MANAGER'),
        ('ACCOUNTANT'),
        ('SALES'),
        ('WAREHOUSE'),
        ('DISPATCH'),
        ('INVENTORY'),
        ('DEVELOPER'),
        ('PARTNER'),
        ('STAFF'),
        ('DRIVER')
),
pages(page_code) AS (
    VALUES
        ('inventory.list'),
        ('inventory.detail'),
        ('inventory.adjust'),
        ('inventory.transfer'),
        ('inventory.stock-balance'),
        ('inventory.safety-stock'),
        ('inventory.edit-requests'),
        ('inventory.edit-requests.decide'),
        ('ecount.import.inventory')
),
grants(page_code, role_code, can_view, can_edit) AS (
    VALUES
        -- inventory.list: batch 조회 + 예약/해제/차감
        ('inventory.list', 'MASTER',     TRUE, TRUE),
        ('inventory.list', 'MANAGER',    TRUE, TRUE),
        ('inventory.list', 'DEVELOPER',  TRUE, TRUE),
        ('inventory.list', 'SALES',      TRUE, TRUE),
        ('inventory.list', 'ACCOUNTANT', TRUE, FALSE),
        ('inventory.list', 'WAREHOUSE',  TRUE, TRUE),
        ('inventory.list', 'INVENTORY',  TRUE, TRUE),

        -- inventory.detail: 감사/상세 조회 전용
        ('inventory.detail', 'MASTER',     TRUE, FALSE),
        ('inventory.detail', 'MANAGER',    TRUE, FALSE),
        ('inventory.detail', 'DEVELOPER',  TRUE, FALSE),
        ('inventory.detail', 'ACCOUNTANT', TRUE, FALSE),
        ('inventory.detail', 'WAREHOUSE',  TRUE, FALSE),
        ('inventory.detail', 'INVENTORY',  TRUE, FALSE),

        -- inventory.adjust: 재고 조정/감사 시작/완료/취소/승인
        ('inventory.adjust', 'MASTER',    TRUE, TRUE),
        ('inventory.adjust', 'MANAGER',   TRUE, TRUE),
        ('inventory.adjust', 'INVENTORY', TRUE, TRUE),

        -- inventory.transfer: 재고 이동 조회/생성/출고/입고
        ('inventory.transfer', 'MASTER',     TRUE, TRUE),
        ('inventory.transfer', 'MANAGER',    TRUE, TRUE),
        ('inventory.transfer', 'DEVELOPER',  TRUE, FALSE),
        ('inventory.transfer', 'SALES',      TRUE, FALSE),
        ('inventory.transfer', 'ACCOUNTANT', TRUE, FALSE),
        ('inventory.transfer', 'WAREHOUSE',  TRUE, TRUE),
        ('inventory.transfer', 'INVENTORY',  TRUE, TRUE),

        -- inventory.stock-balance: 잔액/로트/입고/export
        ('inventory.stock-balance', 'MASTER',    TRUE, TRUE),
        ('inventory.stock-balance', 'MANAGER',   TRUE, TRUE),
        ('inventory.stock-balance', 'DEVELOPER', TRUE, FALSE),
        ('inventory.stock-balance', 'WAREHOUSE', TRUE, TRUE),
        ('inventory.stock-balance', 'INVENTORY', TRUE, TRUE),

        -- inventory.safety-stock: 안전재고 알림/설정
        ('inventory.safety-stock', 'MASTER',    TRUE, TRUE),
        ('inventory.safety-stock', 'MANAGER',   TRUE, TRUE),
        ('inventory.safety-stock', 'WAREHOUSE', TRUE, TRUE),
        ('inventory.safety-stock', 'INVENTORY', TRUE, TRUE),

        -- inventory.edit-requests: 수정/삭제 요청 생성
        ('inventory.edit-requests', 'MASTER',     TRUE, TRUE),
        ('inventory.edit-requests', 'MANAGER',    TRUE, TRUE),
        ('inventory.edit-requests', 'INVENTORY',  TRUE, TRUE),
        ('inventory.edit-requests', 'ACCOUNTANT', TRUE, TRUE),

        -- inventory.edit-requests.decide: 요청 승인/거절
        ('inventory.edit-requests.decide', 'MASTER',     TRUE, TRUE),
        ('inventory.edit-requests.decide', 'MANAGER',    TRUE, TRUE),
        ('inventory.edit-requests.decide', 'ACCOUNTANT', TRUE, TRUE),

        -- ecount.import.inventory: 이카운트 재고 import
        ('ecount.import.inventory', 'MASTER',  TRUE, TRUE),
        ('ecount.import.inventory', 'MANAGER', TRUE, TRUE)
)
INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
SELECT
    gen_random_uuid(),
    r.role_code,
    p.page_code,
    COALESCE(g.can_view, FALSE),
    COALESCE(g.can_edit, FALSE),
    NOW(),
    'system',
    FALSE
FROM pages p
CROSS JOIN roles r
LEFT JOIN grants g
    ON g.page_code = p.page_code
   AND g.role_code = r.role_code
ON CONFLICT DO NOTHING;
