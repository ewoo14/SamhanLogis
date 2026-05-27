-- V38__seed_sp_d7_remaining_preauthorize_page_codes.sql
-- SP-D7 잔여 @PreAuthorize("isAuthenticated()") -> @RequirePermission VIEW 전환 seed.
--
-- D-D7-01 behavior-preserving:
-- 내부 role 한정(PARTNER 제외), INSERT-missing only.
-- 기존 grant 는 보존해 재사용 page 의 deliberate FALSE row 와 VIEW endpoint 권한 widening 을 방지한다.
-- 내부 role 의 기존 FALSE row 로 인한 잠재 회귀는 dual 리뷰 BE 가 per-page 검증한다.

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
        ('STAFF'),
        ('DRIVER')
),
pages(page_code) AS (
    VALUES
        ('notifications.center'),
        ('slip.comments'),
        ('slip.audit-overlay'),
        ('slip.attachments.upload'),
        ('slip.delivery-attachments.upload'),
        ('slip.publish.from-estimate'),
        ('slip.edit-requests'),
        ('estimates.list'),
        ('sales.partner-order.history'),
        ('sales.partner-order.edit-requests'),
        ('products.list'),
        ('products.edit-requests'),
        ('partners.detail'),
        ('inventory.stock-balance')
),
grants(page_code, role_code, can_view, can_edit) AS (
    SELECT p.page_code, r.role_code, TRUE, FALSE
    FROM pages p
    CROSS JOIN roles r
)
INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    r.role_code,
    p.page_code,
    COALESCE(g.can_view, FALSE),
    COALESCE(g.can_edit, FALSE),
    NOW(),
    'sp-d7-remaining-preauthorize-migration',
    NOW(),
    'sp-d7-remaining-preauthorize-migration',
    FALSE
FROM pages p
CROSS JOIN roles r
LEFT JOIN grants g
    ON g.page_code = p.page_code
   AND g.role_code = r.role_code
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING;
