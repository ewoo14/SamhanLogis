-- 변동단가 옵션 정본화: 모든 카테고리의 견적 초기값은 체크 해제로 통일한다.
-- 체크 해제 = 2000-01-01 price_history 변동 전 단가, 체크 = products 현재 단가.
UPDATE price_change_schedule
SET default_pre_change = FALSE
WHERE is_deleted = FALSE;
