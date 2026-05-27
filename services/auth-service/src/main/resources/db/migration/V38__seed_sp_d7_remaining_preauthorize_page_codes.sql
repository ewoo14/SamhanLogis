-- V38__seed_sp_d7_remaining_preauthorize_page_codes.sql
-- SP-D7 잔여 @PreAuthorize("isAuthenticated()") -> @RequirePermission VIEW 전환 seed.
--
-- D-D7-01 behavior-preserving:
-- 내부 role 한정(PARTNER 제외), write-only-before 재사용 page 는 기존 FALSE row 를 TRUE 로 보강한다.
-- SP-D7 이전 VIEW endpoint 가 있던 page 는 *.view 전용 신규 page 로 분리해 기존 endpoint widening 을 피한다.

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
reusable_pages(page_code) AS (
    VALUES
        ('slip.comments'),
        ('slip.audit-overlay'),
        ('slip.attachments.upload'),
        ('slip.delivery-attachments.upload'),
        ('slip.publish.from-estimate'),
        ('slip.edit-requests'),
        ('estimates.list'),
        ('sales.partner-order.edit-requests'),
        ('products.edit-requests')
)
UPDATE role_page_permissions rpp
SET    can_view    = TRUE,
       modified_at = NOW(),
       modified_by = 'sp-d7-cycle2-view-grant'
FROM reusable_pages p
JOIN roles r ON TRUE
WHERE rpp.page_code = p.page_code
  AND rpp.role_code = r.role_code
  AND rpp.is_deleted = FALSE
  AND rpp.can_view IS DISTINCT FROM TRUE;

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
reusable_pages(page_code) AS (
    VALUES
        ('slip.comments'),
        ('slip.audit-overlay'),
        ('slip.attachments.upload'),
        ('slip.delivery-attachments.upload'),
        ('slip.publish.from-estimate'),
        ('slip.edit-requests'),
        ('estimates.list'),
        ('sales.partner-order.edit-requests'),
        ('products.edit-requests')
),
dedicated_pages(page_code) AS (
    VALUES
        ('notifications.center'),
        ('sales.partner-order.history.view'),
        ('products.list.view'),
        ('partners.detail.view'),
        ('inventory.stock-balance.view')
),
pages(page_code) AS (
    SELECT page_code FROM reusable_pages
    UNION ALL
    SELECT page_code FROM dedicated_pages
)
INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    r.role_code,
    p.page_code,
    TRUE,
    FALSE,
    NOW(),
    'sp-d7-cycle2-view-grant',
    NOW(),
    'sp-d7-cycle2-view-grant',
    FALSE
FROM pages p
CROSS JOIN roles r
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING;
