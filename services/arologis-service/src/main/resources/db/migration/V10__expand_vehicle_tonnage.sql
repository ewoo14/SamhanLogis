-- V10__expand_vehicle_tonnage.sql
-- Samhan Public 배차 메뉴 Phase A (D-DB-03) — arologis VehicleTonnage 확장.
--
-- 신규 7 값 + legacy 2 값 보존 (카톡 파싱 backward compat).
-- enum 컬럼 type 은 VARCHAR(20) (V1) 으로 유지, 신규 CHECK constraint 부착.
-- 컬럼 length 가 20 으로 충분 (가장 긴 값 = TONNAGE_1_4 = 11 자).

ALTER TABLE vehicles ADD CONSTRAINT vehicle_tonnage_check
    CHECK (tonnage IN (
        'MOTORCYCLE','DAMAS',
        'TONNAGE_1','TONNAGE_1_4','TONNAGE_1_5','TONNAGE_2_5',
        'TONNAGE_3','TONNAGE_5','TONNAGE_10','TONNAGE_20','TONNAGE_BIG'
    ));
