-- V2__seed_bootstrap_cache.sql
-- 16종 bootstrap 시드 (legacy doGet 4~23 → 본 테이블).
-- 모든 row 는 빈 객체/배열로 시작. 카탈로그 컨텐츠는 admin endpoint 또는 후속 슬라이스에서 갱신.
-- config 행은 DC 9키가 제거된 client-safe 사본만 보관 (M3 가드 일관 — 설계서 §6).

INSERT INTO partner_order_bootstrap_cache
    (id, cache_key, payload_json, version,
     created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
    -- legacy 16개 키 — 빈 배열 / 객체 시드 (FE graceful — 빈 결과여도 mobile-gate 진입 가능)
    ('00000000-0000-0000-0000-000000000001', 'homemulti',       '[]', 1, NOW(), 'system', NULL, NULL, FALSE),
    ('00000000-0000-0000-0000-000000000002', 'singleSets',      '[]', 1, NOW(), 'system', NULL, NULL, FALSE),
    ('00000000-0000-0000-0000-000000000003', 'singleParts',     '[]', 1, NOW(), 'system', NULL, NULL, FALSE),
    ('00000000-0000-0000-0000-000000000004', 'homeDefaults',    '{}', 1, NOW(), 'system', NULL, NULL, FALSE),
    ('00000000-0000-0000-0000-000000000005', 'singleDefaults',  '{}', 1, NOW(), 'system', NULL, NULL, FALSE),
    ('00000000-0000-0000-0000-000000000006', 'singleMatPrices', '{}', 1, NOW(), 'system', NULL, NULL, FALSE),
    ('00000000-0000-0000-0000-000000000007', 'commercialMulti', '[]', 1, NOW(), 'system', NULL, NULL, FALSE),
    ('00000000-0000-0000-0000-000000000008', 'commercialParts', '[]', 1, NOW(), 'system', NULL, NULL, FALSE),
    ('00000000-0000-0000-0000-000000000009', 'oldProducts',     '[]', 1, NOW(), 'system', NULL, NULL, FALSE),
    ('00000000-0000-0000-0000-00000000000a', 'homeInc',         '{}', 1, NOW(), 'system', NULL, NULL, FALSE),
    ('00000000-0000-0000-0000-00000000000b', 'commInc',         '{}', 1, NOW(), 'system', NULL, NULL, FALSE),
    ('00000000-0000-0000-0000-00000000000c', 'singleInc',       '{}', 1, NOW(), 'system', NULL, NULL, FALSE),
    ('00000000-0000-0000-0000-00000000000d', 'singlePartsInc',  '{}', 1, NOW(), 'system', NULL, NULL, FALSE),
    ('00000000-0000-0000-0000-00000000000e', 'specDetailMap',   '{}', 1, NOW(), 'system', NULL, NULL, FALSE),
    -- config 키 — DC 9키 제거된 client-safe 시드 (admin 이 갱신 시도 시 BootstrapService 가 재차 9키 strip)
    ('00000000-0000-0000-0000-00000000000f', 'config',          '{"vatRate":0.1,"deliveryDays":3}', 1, NOW(), 'system', NULL, NULL, FALSE),
    ('00000000-0000-0000-0000-000000000010', 'logoData',        '{"url":"","alt":"SamhanLogis"}',   1, NOW(), 'system', NULL, NULL, FALSE);
