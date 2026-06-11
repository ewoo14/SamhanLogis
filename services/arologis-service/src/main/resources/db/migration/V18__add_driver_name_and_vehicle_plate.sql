-- V18__add_driver_name_and_vehicle_plate.sql
-- 인성데이타 매칭 응답의 기사명/차량번호를 arologis Driver 에 보존한다.

ALTER TABLE drivers
    ADD COLUMN driver_name VARCHAR(50),
    ADD COLUMN vehicle_plate_number VARCHAR(20);
