-- V8__seed_p13_safety_stock.sql
-- P1-3 안전재고 알림 — safety_stock_configs 5건 fixture seed.
--
-- [DEV-SEED] 결정적 UUID 패턴 — production 환경에서는 spring.flyway.locations 분리.
--
-- V6 시드 재사용 UUID:
--   HQ-001 = 11111111-1111-1111-1111-000000000001
--   VH-001 = 11111111-1111-1111-1111-000000000002
--   PROD-001 = a0a0a0a0-0000-0000-0000-000000000001  (AJ040 싱글)
--   PROD-002 = a0a0a0a0-0000-0000-0000-000000000002  (AJ056 멀티)
--   PROD-003 = a0a0a0a0-0000-0000-0000-000000000003  (AM100 실외기)
--
-- stock_balances 현황 (V6 seed 기준):
--   HQ-001 + PROD-001: availableQty=115
--   HQ-001 + PROD-002: availableQty=43
--   HQ-001 + PROD-003: availableQty=27
--   VH-001 + PROD-001: availableQty=6
--   VH-001 + PROD-002: availableQty=4
--
-- 부족 시나리오 (availableQty < threshold):
--   [P13-CFG-002] HQ-001+PROD-002: availableQty=43, threshold=50  → BELOW (부족)
--   [P13-CFG-003] HQ-001+PROD-003: availableQty=27, threshold=30  → BELOW (부족)
--   [P13-CFG-004] VH-001+PROD-001: availableQty=6,  threshold=10  → BELOW (부족)
--
-- 정상 시나리오 (availableQty >= threshold):
--   [P13-CFG-001] HQ-001+PROD-001: availableQty=115, threshold=100 → OK
--   [P13-CFG-005] VH-001+PROD-002: availableQty=4,   threshold=3   → OK

INSERT INTO safety_stock_configs (
    id, product_id, warehouse_id, threshold, note,
    created_at, created_by, is_deleted
) VALUES
-- P13-CFG-001: HQ-001 + PROD-001 (AJ040 싱글) — threshold=100, 정상(115≥100)
('f1f1f1f1-0001-0000-0000-000000000001',
 'a0a0a0a0-0000-0000-0000-000000000001',
 '11111111-1111-1111-1111-000000000001',
 100, '[DEV-SEED] AJ040 싱글 HQ 안전재고 — 정상 상태',
 CURRENT_TIMESTAMP, 'seed', FALSE),

-- P13-CFG-002: HQ-001 + PROD-002 (AJ056 멀티) — threshold=50, 부족(43<50)
('f1f1f1f1-0002-0000-0000-000000000002',
 'a0a0a0a0-0000-0000-0000-000000000002',
 '11111111-1111-1111-1111-000000000001',
 50, '[DEV-SEED] AJ056 멀티 HQ 안전재고 — 부족 상태',
 CURRENT_TIMESTAMP, 'seed', FALSE),

-- P13-CFG-003: HQ-001 + PROD-003 (AM100 실외기) — threshold=30, 부족(27<30)
('f1f1f1f1-0003-0000-0000-000000000003',
 'a0a0a0a0-0000-0000-0000-000000000003',
 '11111111-1111-1111-1111-000000000001',
 30, '[DEV-SEED] AM100 실외기 HQ 안전재고 — 부족 상태',
 CURRENT_TIMESTAMP, 'seed', FALSE),

-- P13-CFG-004: VH-001 + PROD-001 (AJ040 싱글 차량창고) — threshold=10, 부족(6<10)
('f1f1f1f1-0004-0000-0000-000000000004',
 'a0a0a0a0-0000-0000-0000-000000000001',
 '11111111-1111-1111-1111-000000000002',
 10, '[DEV-SEED] AJ040 싱글 VH 안전재고 — 부족 상태',
 CURRENT_TIMESTAMP, 'seed', FALSE),

-- P13-CFG-005: VH-001 + PROD-002 (AJ056 멀티 차량창고) — threshold=3, 정상(4≥3)
('f1f1f1f1-0005-0000-0000-000000000005',
 'a0a0a0a0-0000-0000-0000-000000000002',
 '11111111-1111-1111-1111-000000000002',
 3, '[DEV-SEED] AJ056 멀티 VH 안전재고 — 정상 상태',
 CURRENT_TIMESTAMP, 'seed', FALSE);
