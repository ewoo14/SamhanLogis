-- V17__seed_mig4_page_codes.sql
-- MIG-4 이카운트 영업·세무 raw 4종 import 화면 권한 seed.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER',   'ecount.mig4.tax-invoice',     TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',   'ecount.mig4.sales-slip-line', TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',   'ecount.mig4.summary',         TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MASTER',   'ecount.mig4.order',           TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER',  'ecount.mig4.tax-invoice',     TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER',  'ecount.mig4.sales-slip-line', TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER',  'ecount.mig4.summary',         TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER',  'ecount.mig4.order',           TRUE,  TRUE,  NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DISPATCH', 'ecount.mig4.tax-invoice',     FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DISPATCH', 'ecount.mig4.sales-slip-line', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DISPATCH', 'ecount.mig4.summary',         FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'DISPATCH', 'ecount.mig4.order',           FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MEMBER',   'ecount.mig4.tax-invoice',     FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MEMBER',   'ecount.mig4.sales-slip-line', FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MEMBER',   'ecount.mig4.summary',         FALSE, FALSE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MEMBER',   'ecount.mig4.order',           FALSE, FALSE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;
