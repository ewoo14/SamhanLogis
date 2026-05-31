-- V9: 카테고리 관리방식 — 개별시리얼(true) vs batch(false). Phase INV-S / S1.
-- 기존 row 는 DEFAULT FALSE 로 초기화되므로 legacy 호환.
ALTER TABLE categories ADD COLUMN serial_managed BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN categories.serial_managed IS '개별시리얼 관리 여부(에어컨/판넬=true, 부자재 등=false) — stock_instances 대상 판정';

-- V2 시드 에어컨 계열 카테고리 serial_managed=true 갱신
-- 대상: HVAC(공조 루트), INDOOR(실내기), OUTDOOR(실외기), INDOOR_WALL(벽걸이형), INDOOR_CEILING(시스템 천장형)
-- 제외: PIPING(배관/부속), CONTROL(계장/제어) — batch 관리
-- 판넬 카테고리(PANEL 등)는 현재 V2 시드에 미정의 — 추가 시 별도 마이그레이션으로 serial_managed=true 지정 필요
UPDATE categories
   SET serial_managed = TRUE
 WHERE code IN ('HVAC', 'INDOOR', 'OUTDOOR', 'INDOOR_WALL', 'INDOOR_CEILING')
   AND is_deleted = FALSE;
