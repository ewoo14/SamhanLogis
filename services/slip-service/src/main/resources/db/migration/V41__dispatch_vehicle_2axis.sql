-- V41__dispatch_vehicle_2axis.sql
-- 배차 차량 모델 2축 확장: 차종(bodyType) + 톤수(tonnage).
-- legacy vehicle_type 은 arologis wire 호환용 파생값으로 유지한다.
-- ELSE 'T_1' 은 운영 중 알 수 없는 legacy 값이 들어왔을 때 migration 중단을 피하는 slice1 안전망이다.
-- 실제 신규 입력 정합성은 domain/service matrix 검증과 CHECK 제약이 담당한다.

ALTER TABLE dispatch_vehicle_group
    ADD COLUMN vehicle_body_type VARCHAR(32),
    ADD COLUMN tonnage VARCHAR(16);

UPDATE dispatch_vehicle_group
SET vehicle_body_type = CASE vehicle_type
        WHEN 'MOTORCYCLE' THEN 'MOTORCYCLE'
        WHEN 'DAMAS' THEN 'DAMAS'
        ELSE 'CARGO'
    END,
    tonnage = CASE vehicle_type
        WHEN 'MOTORCYCLE' THEN NULL
        WHEN 'DAMAS' THEN NULL
        WHEN 'TONNAGE_1' THEN 'T_1'
        WHEN 'TONNAGE_1_5' THEN 'T_1_4'
        WHEN 'TONNAGE_2_5' THEN 'T_2_5'
        WHEN 'TONNAGE_3' THEN 'T_3_5'
        WHEN 'TONNAGE_5' THEN 'T_5'
        WHEN 'TONNAGE_10' THEN 'T_11'
        WHEN 'TONNAGE_20' THEN 'T_25'
        -- slice1 안전망: 기존 row backfill 중단 방지용 기본값. 신규 입력에는 사용되지 않는다.
        ELSE 'T_1'
    END;

ALTER TABLE dispatch_vehicle_group
    ALTER COLUMN vehicle_body_type SET NOT NULL;

ALTER TABLE dispatch_vehicle_group
    ADD CONSTRAINT chk_dispatch_vehicle_group_body_type
        CHECK (vehicle_body_type IN (
            'MOTORCYCLE','SEDAN','DAMAS','LABO','CARGO','WINGBODY','TOPCAR','LIFT',
            'REEFER','VIBRATION_FREE','AXLE','TRAILER'
        )),
    ADD CONSTRAINT chk_dispatch_vehicle_group_tonnage
        CHECK (tonnage IS NULL OR tonnage IN (
            'T_1','T_1_2','T_1_4','T_2_5','T_3_5','T_5','T_11','T_14','T_18','T_25'
        )),
    ADD CONSTRAINT chk_dispatch_vehicle_group_body_tonnage_matrix
        CHECK (
            (
                vehicle_body_type IN ('MOTORCYCLE','SEDAN','DAMAS','LABO')
                AND tonnage IS NULL
            )
            OR
            (
                vehicle_body_type IN (
                    'CARGO','WINGBODY','TOPCAR','LIFT',
                    'REEFER','VIBRATION_FREE','AXLE','TRAILER'
                )
                AND tonnage IS NOT NULL
            )
        );
