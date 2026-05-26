-- V36__seed_sp_d6_6_slip_page_codes.sql
-- SP-D6-6 slip-service @RequirePermission migration 신규 PageCode seed.
-- 11-role matrix 는 유지하고, publish 계열의 legacy service role 은 보존 row 로 별도 추가한다.

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
        ('purchases.slip.edit'),
        ('purchases.slip.delete'),
        ('sales.slip.create'),
        ('sales.slip.edit'),
        ('sales.slip.confirm'),
        ('sales.slip.cancel'),
        ('slip.transfer.process'),
        ('slip.reject'),
        ('slip.period-lock'),
        ('slip.print.next-day'),
        ('slip.print.export'),
        ('slip.cleanup'),
        ('slip.cleanup-history'),
        ('slip.attachments.upload'),
        ('slip.attachments.delete'),
        ('slip.delivery-attachments.upload'),
        ('slip.photo-audit'),
        ('slip.comments'),
        ('slip.audit-overlay'),
        ('slip.audit-revert'),
        ('slip.edit-requests'),
        ('slip.edit-requests.decide'),
        ('slip.signature'),
        ('slip.lookup-product'),
        ('slip.delivery-batch'),
        ('slip.mobile-sales'),
        ('slip.publish.from-estimate'),
        ('slip.publish.from-partner-order')
),
grants(page_code, role_code, can_view, can_edit) AS (
    VALUES
        -- 매입 전표 직접 수정/삭제
        ('purchases.slip.edit',   'MASTER',    TRUE, TRUE),
        ('purchases.slip.edit',   'MANAGER',   TRUE, TRUE),
        ('purchases.slip.edit',   'WAREHOUSE', TRUE, TRUE),
        ('purchases.slip.delete', 'MASTER',    TRUE, TRUE),
        ('purchases.slip.delete', 'MANAGER',   TRUE, TRUE),
        ('purchases.slip.delete', 'WAREHOUSE', TRUE, TRUE),

        -- 매출/수동 전표 작성·수정·취소
        ('sales.slip.create', 'MASTER',  TRUE, TRUE),
        ('sales.slip.create', 'MANAGER', TRUE, TRUE),
        ('sales.slip.create', 'SALES',   TRUE, TRUE),
        ('sales.slip.edit',   'MASTER',  TRUE, TRUE),
        ('sales.slip.edit',   'MANAGER', TRUE, TRUE),
        ('sales.slip.edit',   'SALES',   TRUE, TRUE),
        ('sales.slip.cancel', 'MASTER',  TRUE, TRUE),
        ('sales.slip.cancel', 'MANAGER', TRUE, TRUE),
        ('sales.slip.cancel', 'SALES',   TRUE, TRUE),

        -- 전표 확정/반려/기간잠금
        ('sales.slip.confirm', 'MASTER',     TRUE, TRUE),
        ('sales.slip.confirm', 'MANAGER',    TRUE, TRUE),
        ('sales.slip.confirm', 'ACCOUNTANT', TRUE, TRUE),
        ('slip.reject',        'MASTER',     TRUE, TRUE),
        ('slip.reject',        'MANAGER',    TRUE, TRUE),
        ('slip.period-lock',   'MASTER',     TRUE, TRUE),
        ('slip.period-lock',   'MANAGER',    TRUE, TRUE),
        ('slip.period-lock',   'ACCOUNTANT', TRUE, TRUE),

        -- 물류 처리 상태 전이
        ('slip.transfer.process', 'MASTER',    TRUE, TRUE),
        ('slip.transfer.process', 'MANAGER',   TRUE, TRUE),
        ('slip.transfer.process', 'WAREHOUSE', TRUE, TRUE),
        ('slip.transfer.process', 'INVENTORY', TRUE, TRUE),

        -- 인쇄/전표정리
        ('slip.print.next-day',   'MASTER',  TRUE, TRUE),
        ('slip.print.next-day',   'MANAGER', TRUE, TRUE),
        ('slip.print.next-day',   'SALES',   TRUE, TRUE),
        ('slip.print.export',     'MASTER',  TRUE, TRUE),
        ('slip.print.export',     'MANAGER', TRUE, TRUE),
        ('slip.cleanup',          'MASTER',  TRUE, TRUE),
        ('slip.cleanup',          'MANAGER', TRUE, TRUE),
        ('slip.cleanup',          'SALES',   TRUE, TRUE),
        ('slip.cleanup-history',  'MASTER',  TRUE, TRUE),
        ('slip.cleanup-history',  'MANAGER', TRUE, TRUE),
        ('slip.cleanup-history',  'SALES',   TRUE, TRUE),

        -- 첨부/사진 감사/댓글/audit
        ('slip.attachments.upload',          'MASTER',    TRUE, TRUE),
        ('slip.attachments.upload',          'MANAGER',   TRUE, TRUE),
        ('slip.attachments.upload',          'SALES',     TRUE, TRUE),
        ('slip.attachments.upload',          'WAREHOUSE', TRUE, TRUE),
        ('slip.attachments.upload',          'INVENTORY', TRUE, TRUE),
        ('slip.attachments.upload',          'DRIVER',    TRUE, TRUE),
        ('slip.attachments.delete',          'MASTER',    TRUE, TRUE),
        ('slip.attachments.delete',          'MANAGER',   TRUE, TRUE),
        ('slip.attachments.delete',          'SALES',     TRUE, TRUE),
        ('slip.delivery-attachments.upload', 'MASTER',    TRUE, TRUE),
        ('slip.delivery-attachments.upload', 'MANAGER',   TRUE, TRUE),
        ('slip.delivery-attachments.upload', 'SALES',     TRUE, TRUE),
        ('slip.delivery-attachments.upload', 'DRIVER',    TRUE, TRUE),
        ('slip.photo-audit',                 'MASTER',    TRUE, FALSE),
        ('slip.photo-audit',                 'MANAGER',   TRUE, FALSE),
        ('slip.photo-audit',                 'WAREHOUSE', TRUE, FALSE),
        ('slip.comments',                    'MASTER',    TRUE, TRUE),
        ('slip.comments',                    'MANAGER',   TRUE, TRUE),
        ('slip.comments',                    'SALES',     TRUE, TRUE),
        ('slip.comments',                    'WAREHOUSE', TRUE, TRUE),
        ('slip.audit-overlay',               'MASTER',    TRUE, TRUE),
        ('slip.audit-overlay',               'MANAGER',   TRUE, TRUE),
        ('slip.audit-overlay',               'SALES',     TRUE, TRUE),
        ('slip.audit-overlay',               'WAREHOUSE', TRUE, TRUE),
        ('slip.audit-revert',                'MASTER',    TRUE, TRUE),
        ('slip.audit-revert',                'MANAGER',   TRUE, TRUE),

        -- 수정 요청: 생성과 결정 권한 분리
        ('slip.edit-requests',        'MASTER',  TRUE, TRUE),
        ('slip.edit-requests',        'MANAGER', TRUE, TRUE),
        ('slip.edit-requests',        'SALES',   TRUE, TRUE),
        ('slip.edit-requests.decide', 'MASTER',  TRUE, TRUE),
        ('slip.edit-requests.decide', 'MANAGER', TRUE, TRUE),

        -- 서명/lookup/배송배치/모바일
        ('slip.signature',      'MASTER',    TRUE, TRUE),
        ('slip.signature',      'MANAGER',   TRUE, FALSE),
        ('slip.lookup-product', 'MASTER',    TRUE, FALSE),
        ('slip.lookup-product', 'MANAGER',   TRUE, FALSE),
        ('slip.lookup-product', 'SALES',     TRUE, FALSE),
        ('slip.lookup-product', 'ACCOUNTANT',TRUE, FALSE),
        ('slip.lookup-product', 'WAREHOUSE', TRUE, FALSE),
        ('slip.lookup-product', 'INVENTORY', TRUE, FALSE),
        ('slip.delivery-batch', 'MASTER',    TRUE, TRUE),
        ('slip.delivery-batch', 'MANAGER',   TRUE, TRUE),
        ('slip.mobile-sales',   'MASTER',    TRUE, TRUE),
        ('slip.mobile-sales',   'MANAGER',   TRUE, TRUE),
        ('slip.mobile-sales',   'SALES',     TRUE, TRUE),

        -- 통합 발행
        ('slip.publish.from-estimate',      'MASTER',  TRUE, TRUE),
        ('slip.publish.from-estimate',      'MANAGER', TRUE, TRUE),
        ('slip.publish.from-estimate',      'SALES',   TRUE, TRUE),
        ('slip.publish.from-partner-order', 'MASTER',  TRUE, TRUE),
        ('slip.publish.from-partner-order', 'MANAGER', TRUE, TRUE)
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

-- 11-role UI matrix 밖의 service-to-service legacy role 보존.
INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    (gen_random_uuid(), 'INTEGRATION',   'slip.publish.from-estimate',      TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'INTEGRATION',   'slip.publish.from-partner-order', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'PARTNER_ADMIN', 'slip.publish.from-partner-order', TRUE, TRUE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;

-- dispatch.board 는 기존 PageCode 이지만 DispatchTaskAdminController 의 원 @PreAuthorize
-- (DISPATCH/MANAGER/MASTER) 와 맞추기 위해 MANAGER edit 를 보정한다.
UPDATE role_page_permissions
SET    can_edit    = TRUE,
       modified_at = NOW(),
       modified_by = 'sp-d6-6-dispatch-board-exact-role'
WHERE  role_code  = 'MANAGER'
  AND  page_code  = 'dispatch.board'
  AND  is_deleted = FALSE;
