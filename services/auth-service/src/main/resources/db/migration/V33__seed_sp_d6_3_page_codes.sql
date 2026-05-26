-- V33__seed_sp_d6_3_page_codes.sql
-- SP-D6-3 notification + user @RequirePermission migration 신규 PageCode seed
--
-- 기존 PageCode 재사용:
--   messenger.admin
--   notification.dispatch-sms.send-audit (legacy SP-D3 audit code; SP-D6-3 uses dispatch.sms-save-history)
--   admin.employees / admin.users
--   ecount.mig2.department / ecount.mig6.*

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    -- notifications.admin — 알림 발송 admin (기존 MASTER/MANAGER cap 보존)
    (gen_random_uuid(), 'MASTER',    'notifications.admin', TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER',   'notifications.admin', TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'ACCOUNTANT','notifications.admin', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'SALES',     'notifications.admin', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'WAREHOUSE', 'notifications.admin', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DISPATCH',  'notifications.admin', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'INVENTORY', 'notifications.admin', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DEVELOPER', 'notifications.admin', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'PARTNER',   'notifications.admin', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'STAFF',     'notifications.admin', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DRIVER',    'notifications.admin', FALSE, FALSE, NOW(), 'system', FALSE),

    -- aligo.address-book — 알리고 주소록 sync admin (기존 MASTER/MANAGER cap 보존)
    (gen_random_uuid(), 'MASTER',    'aligo.address-book', TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER',   'aligo.address-book', TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'ACCOUNTANT','aligo.address-book', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'SALES',     'aligo.address-book', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'WAREHOUSE', 'aligo.address-book', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DISPATCH',  'aligo.address-book', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'INVENTORY', 'aligo.address-book', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DEVELOPER', 'aligo.address-book', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'PARTNER',   'aligo.address-book', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'STAFF',     'aligo.address-book', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DRIVER',    'aligo.address-book', FALSE, FALSE, NOW(), 'system', FALSE),

    -- dispatch.sms-save-history — 배차문자 저장내역 (기존 DISPATCH/MANAGER/MASTER cap 보존)
    (gen_random_uuid(), 'MASTER',    'dispatch.sms-save-history', TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER',   'dispatch.sms-save-history', TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DISPATCH',  'dispatch.sms-save-history', TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'ACCOUNTANT','dispatch.sms-save-history', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'SALES',     'dispatch.sms-save-history', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'WAREHOUSE', 'dispatch.sms-save-history', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'INVENTORY', 'dispatch.sms-save-history', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DEVELOPER', 'dispatch.sms-save-history', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'PARTNER',   'dispatch.sms-save-history', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'STAFF',     'dispatch.sms-save-history', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DRIVER',    'dispatch.sms-save-history', FALSE, FALSE, NOW(), 'system', FALSE),

    -- dispatch.batch — 배차안내 SMS batch preview/send (기존 DISPATCH/MANAGER/MASTER cap 보존)
    (gen_random_uuid(), 'MASTER',    'dispatch.batch', TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER',   'dispatch.batch', TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DISPATCH',  'dispatch.batch', TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'ACCOUNTANT','dispatch.batch', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'SALES',     'dispatch.batch', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'WAREHOUSE', 'dispatch.batch', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'INVENTORY', 'dispatch.batch', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DEVELOPER', 'dispatch.batch', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'PARTNER',   'dispatch.batch', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'STAFF',     'dispatch.batch', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DRIVER',    'dispatch.batch', FALSE, FALSE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;
