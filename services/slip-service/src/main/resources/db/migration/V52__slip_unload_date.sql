-- V52: 출고전표 배송일정 하차일(N) 구조화 컬럼 추가
-- 상차일 M = 기존 slip_date (잠금, 불변), 하차일 N = 본 컬럼 (nullable override 허용)
-- 기존 전표는 NULL 유지 (legacy 호환, YAGNI — memo 텍스트 마이그레이션 미수행)
ALTER TABLE slips ADD COLUMN unload_date DATE NULL;
COMMENT ON COLUMN slips.unload_date IS '하차일 N — computeUnloadDate(slipDate, deliveryTag) 기본 계산 또는 사용자 override. 지방/야적 태그 전표만 값 보유. null 이면 배송일정 미적용.';
