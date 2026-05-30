-- V41__seed_partner_order_convert_page.sql
-- Phase 2.6a 거래처 주문 부분전환 권한 시드.
--
-- 신규 page: sales.partner-order.convert
--   CREATE 권한 — MANAGER/SALES 역할에 부여 (출고전표 생성 행위).
--
-- 선택 근거:
--   - 부분전환(convert-to-slip)은 출고전표를 새로 발행하는 write 행위이다.
--     기존 edit(UPDATE) 와 의미가 다르므로 별도 page 코드로 분리하여 역할별 독립 제어를 보장한다.
--   - slip.publish.from-partner-order 는 slip-service 내부 발행 endpoint 권한이므로
--     partner-order-service 의 convert endpoint 에는 별도 page 를 사용한다.
--   - MASTER 는 V40 패턴과 동일하게 DynamicPermissionClient bypass 처리 —
--     role_page_permission_templates 에만 삽입하고 account 에는 materialize 하지 않는다.
--   - PARTNER 역할은 거래처 포털 전용이며 내부 전환 액션 대상이 아니므로 제외한다.
--
-- 권한 부여 역할:
--   - MASTER:   can_create=TRUE (템플릿만, account materialize 대상 외)
--   - MANAGER:  can_create=TRUE
--   - SALES:    can_create=TRUE

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- (1) role_page_permission_templates 에 sales.partner-order.convert 삽입
INSERT INTO role_page_permission_templates
    (id, role_code, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER',  'sales.partner-order.convert',
     TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE,
     NOW(), 'v41-phase2-6a-convert', NOW(), 'v41-phase2-6a-convert', FALSE),
    (gen_random_uuid(), 'MANAGER', 'sales.partner-order.convert',
     TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE,
     NOW(), 'v41-phase2-6a-convert', NOW(), 'v41-phase2-6a-convert', FALSE),
    (gen_random_uuid(), 'SALES',   'sales.partner-order.convert',
     TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE,
     NOW(), 'v41-phase2-6a-convert', NOW(), 'v41-phase2-6a-convert', FALSE)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING;

-- (2) account_page_permissions 에 비-MASTER 역할 계정 materialize
--     (V40 패턴과 동일 — accounts.role NOT IN ('MASTER', 'PARTNER'))
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
    'v41-phase2-6a-convert',
    NOW(),
    'v41-phase2-6a-convert',
    FALSE
FROM accounts a
JOIN role_page_permission_templates t
  ON t.role_code = a.role
 AND t.page_code = 'sales.partner-order.convert'
 AND t.is_deleted = FALSE
WHERE a.is_deleted = FALSE
  AND a.enabled = TRUE
  AND a.role NOT IN ('MASTER', 'PARTNER')
ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE DO NOTHING;
