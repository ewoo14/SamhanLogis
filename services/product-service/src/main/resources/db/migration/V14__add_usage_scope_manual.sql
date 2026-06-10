-- V14: 품목 노출 수동 override 플래그
-- 근거: project_item_exposure_and_menu_5cat.md §1 — 시트 자동 분류 + 품목별 수동 토글
--   usageScopeManual=true 인 품목은 ProductSheetSyncService upsert 시
--   usageScope/estimateCategory 를 시트 기준으로 덮어쓰지 않음 (displayOrder 는 계속 갱신).
--   clearUsageManual() 로 플래그 해제 시 다음 sync 에서 시트 기준 재분류됨.
-- 옵션 B: 단일 usage_scope 컬럼 유지 + manual 플래그 추가 (COALESCE 이중 컬럼 모델 기각 — 쿼리 단순성).
ALTER TABLE products ADD COLUMN IF NOT EXISTS usage_scope_manual BOOLEAN NOT NULL DEFAULT FALSE;
