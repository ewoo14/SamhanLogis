-- V11__bundle_component_unique_active.sql
-- 2026-06-09 — BUNDLE 구성품 멱등 적재 가드.
--
-- ProductSheetSyncService 가 시트 sync 마다 (부모 BUNDLE, 구성품 modelCode) 단위로 upsert 하는데,
-- 동일 (bundle_product_id, component_product_code) active 행이 중복 생성되지 않도록 부분 유니크 인덱스를
-- 둔다(소프트삭제 행은 제외 → 재등장 시 신규 active 1행 허용, 누적 active 중복은 차단).
-- bundle_component 는 아직 실 적재 0 이라 기존 데이터 충돌 없음.

CREATE UNIQUE INDEX IF NOT EXISTS ux_bundle_component_active
    ON bundle_component (bundle_product_id, component_product_code)
    WHERE is_deleted = FALSE;
