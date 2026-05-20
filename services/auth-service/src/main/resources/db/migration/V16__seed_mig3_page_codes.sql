-- V16__seed_mig3_page_codes.sql
-- MIG-3 이카운트 회계 전표 4종 import 화면 권한 seed.
-- 권한: MASTER / MANAGER edit 허용, DISPATCH / MEMBER 명시 차단.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER',   'ecount.mig3.purchase-slip',   TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',   'ecount.mig3.sales-slip',      TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',   'ecount.mig3.general-voucher', TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',   'ecount.mig3.journal-entry',   TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER',  'ecount.mig3.purchase-slip',   TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER',  'ecount.mig3.sales-slip',      TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER',  'ecount.mig3.general-voucher', TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER',  'ecount.mig3.journal-entry',   TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DISPATCH', 'ecount.mig3.purchase-slip',   FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DISPATCH', 'ecount.mig3.sales-slip',      FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DISPATCH', 'ecount.mig3.general-voucher', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DISPATCH', 'ecount.mig3.journal-entry',   FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MEMBER',   'ecount.mig3.purchase-slip',   FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MEMBER',   'ecount.mig3.sales-slip',      FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MEMBER',   'ecount.mig3.general-voucher', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MEMBER',   'ecount.mig3.journal-entry',   FALSE, FALSE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;
