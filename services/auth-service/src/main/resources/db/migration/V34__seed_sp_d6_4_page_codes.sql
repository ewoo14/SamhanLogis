-- V34__seed_sp_d6_4_page_codes.sql
-- SP-D6-4 partner + arologis @RequirePermission migration 신규 PageCode seed
--
-- 기존 PageCode 재사용:
--   partners.detail / partners.block / arologis.region
--   partners.edit-request / arologis.admin 는 legacy matrix 호환용으로 유지한다.

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
        ('partners.search'),
        ('partners.edit'),
        ('partners.delete'),
        ('partners.credit-history'),
        ('partners.block.bulk'),
        ('partners.4tab'),
        ('partners.4tab.edit'),
        ('partners.edit-requests'),
        ('partners.edit-requests.decide'),
        ('arologis.dispatch.admin'),
        ('arologis.dispatch.ops'),
        ('arologis.region.manage'),
        ('arologis.edit-requests'),
        ('arologis.edit-requests.decide'),
        ('arologis.driver')
),
grants(page_code, role_code, can_view, can_edit) AS (
    VALUES
        -- partners.search — MASTER/MANAGER/SALES 목록/검색 조회
        ('partners.search', 'MASTER',  TRUE, FALSE),
        ('partners.search', 'MANAGER', TRUE, FALSE),
        ('partners.search', 'SALES',   TRUE, FALSE),

        -- partners.edit — MASTER/MANAGER 등록/수정/export/import
        ('partners.edit', 'MASTER',  TRUE, TRUE),
        ('partners.edit', 'MANAGER', TRUE, TRUE),

        -- partners.delete — MASTER soft-delete
        ('partners.delete', 'MASTER', TRUE, TRUE),

        -- partners.credit-history — MASTER/MANAGER/ACCOUNTANT 신용 이력 조회
        ('partners.credit-history', 'MASTER',     TRUE, FALSE),
        ('partners.credit-history', 'MANAGER',    TRUE, FALSE),
        ('partners.credit-history', 'ACCOUNTANT', TRUE, FALSE),

        -- partners.block.bulk — MASTER bulk import/delete
        ('partners.block.bulk', 'MASTER', TRUE, TRUE),

        -- partners.4tab — MASTER/MANAGER/SALES 4탭 조회/일괄 등록
        ('partners.4tab', 'MASTER',  TRUE, TRUE),
        ('partners.4tab', 'MANAGER', TRUE, TRUE),
        ('partners.4tab', 'SALES',   TRUE, TRUE),

        -- partners.4tab.edit — MASTER/MANAGER 4탭 mutation
        ('partners.4tab.edit', 'MASTER',  TRUE, TRUE),
        ('partners.4tab.edit', 'MANAGER', TRUE, TRUE),

        -- partners.edit-requests — MASTER/MANAGER/ACCOUNTANT 생성/이력/SSE
        ('partners.edit-requests', 'MASTER',     TRUE, TRUE),
        ('partners.edit-requests', 'MANAGER',    TRUE, TRUE),
        ('partners.edit-requests', 'ACCOUNTANT', TRUE, TRUE),

        -- partners.edit-requests.decide — MASTER/MANAGER 승인/거절/대시보드
        ('partners.edit-requests.decide', 'MASTER',  TRUE, TRUE),
        ('partners.edit-requests.decide', 'MANAGER', TRUE, TRUE),

        -- arologis.dispatch.admin — MASTER/MANAGER admin dispatch
        ('arologis.dispatch.admin', 'MASTER',  TRUE, TRUE),
        ('arologis.dispatch.admin', 'MANAGER', TRUE, TRUE),

        -- arologis.dispatch.ops — MASTER/MANAGER/DISPATCH 운영성 조회/저장
        ('arologis.dispatch.ops', 'MASTER',   TRUE, TRUE),
        ('arologis.dispatch.ops', 'MANAGER',  TRUE, TRUE),
        ('arologis.dispatch.ops', 'DISPATCH', TRUE, TRUE),

        -- arologis.region.manage — MASTER/MANAGER region mutation
        ('arologis.region.manage', 'MASTER',  TRUE, TRUE),
        ('arologis.region.manage', 'MANAGER', TRUE, TRUE),

        -- arologis.edit-requests — MASTER/MANAGER/DISPATCH 생성
        ('arologis.edit-requests', 'MASTER',   TRUE, TRUE),
        ('arologis.edit-requests', 'MANAGER',  TRUE, TRUE),
        ('arologis.edit-requests', 'DISPATCH', TRUE, TRUE),

        -- arologis.edit-requests.decide — MASTER/MANAGER 승인/거절
        ('arologis.edit-requests.decide', 'MASTER',  TRUE, TRUE),
        ('arologis.edit-requests.decide', 'MANAGER', TRUE, TRUE),

        -- arologis.driver — MASTER/MANAGER/DRIVER 기사앱
        ('arologis.driver', 'MASTER',  TRUE, TRUE),
        ('arologis.driver', 'MANAGER', TRUE, TRUE),
        ('arologis.driver', 'DRIVER',  TRUE, TRUE)
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
