-- V40__seed_phase2_4_partner_order_revisions_page.sql
-- Phase 2.4 거래처 주문 버전이력 복원 권한 시드.
--
-- 신규 page: sales.partner-order.revisions
--   RESTORE 권한 — MASTER/MANAGER/SALES 역할에 부여.
--
-- 선택 근거:
--   - VIEW (목록/상세 조회) 는 기존 sales.partner-order.history.view (V38 시드)
--     를 재사용하며 모든 역할에 can_view=TRUE 가 이미 부여되어 있음 → 추가 grant 불필요.
--   - RESTORE 는 주문 데이터를 변경하는 write 작업이므로 history.view 에 얹는 것이
--     의미상 부적절하고, 역할별 독립 제어가 필요하다.
--     신규 page sales.partner-order.revisions 를 분리해 RESTORE grant 를 관리한다.
--   - MASTER 는 V39 bypass 처리(role NOT IN MASTER) 로 account_page_permissions 에
--     materialize 되지 않으므로 role_page_permission_templates 에만 삽입한다.
--     실제 MASTER 계정은 DynamicPermissionClient 에서 bypass 처리.
--
-- 권한 부여 역할:
--   - MASTER:   can_restore=TRUE (템플릿만, account materialize 대상 외)
--   - MANAGER:  can_restore=TRUE
--   - SALES:    can_restore=TRUE
--   - 그 외 역할: 이 page 에 대한 grant 없음 (RESTORE 불가)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- (1) role_page_permission_templates 에 sales.partner-order.revisions 삽입
INSERT INTO role_page_permission_templates
    (id, role_code, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER',  'sales.partner-order.revisions',
     TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE,
     NOW(), 'v40-phase2-4-revisions', NOW(), 'v40-phase2-4-revisions', FALSE),
    (gen_random_uuid(), 'MANAGER', 'sales.partner-order.revisions',
     TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE,
     NOW(), 'v40-phase2-4-revisions', NOW(), 'v40-phase2-4-revisions', FALSE),
    (gen_random_uuid(), 'SALES',   'sales.partner-order.revisions',
     TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE,
     NOW(), 'v40-phase2-4-revisions', NOW(), 'v40-phase2-4-revisions', FALSE)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING;

-- (2) account_page_permissions 에 비-MASTER 역할 계정 materialize
--     (V39 패턴과 동일 — accounts.role NOT IN ('MASTER', 'PARTNER'))
INSERT INTO account_page_permissions
    (id, account_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    a.id,
    t.page_code,
    t.can_view,
    t.can_create,
    t.can_update,
    t.can_delete,
    t.can_restore,
    t.can_download,
    t.can_print,
    NOW(),
    'v40-phase2-4-revisions',
    NOW(),
    'v40-phase2-4-revisions',
    FALSE
FROM accounts a
JOIN role_page_permission_templates t
  ON t.role_code = a.role
 AND t.page_code = 'sales.partner-order.revisions'
 AND t.is_deleted = FALSE
WHERE a.is_deleted = FALSE
  AND a.enabled = TRUE
  AND a.role NOT IN ('MASTER', 'PARTNER')
ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE DO NOTHING;
