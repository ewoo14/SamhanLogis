-- V23__add_price_change_schedule_default_variant.sql
-- #17 단가변동 S4a: 카테고리별 "인상 전 단가" 체크박스 기본값 설정.
-- estimate-app 이 향후 GET /products/internal/price-change-default-variant 로 조회해
-- 견적 작성 화면의 "인상 전 단가" 체크박스 초기 상태를 세팅하는 데 사용한다.
-- 기존 /products/internal/price-change-schedule (category -> effectiveDate 맵) 응답 shape 는
-- 본 마이그레이션으로 변경되지 않는다 (#688 order-app 소비 계약 유지).

ALTER TABLE price_change_schedule
    ADD COLUMN IF NOT EXISTS default_pre_change BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN price_change_schedule.default_pre_change IS
    '견적 카테고리별 "인상 전 단가" 체크박스 초기값. TRUE 면 estimate-app 이 인상 전 단가를 기본 선택한다. 기본값 FALSE(인상 후 단가 기본).';
