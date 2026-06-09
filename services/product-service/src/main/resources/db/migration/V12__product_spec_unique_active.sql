-- V12__product_spec_unique_active.sql
-- 2026-06-09 — ProductSpec 사양 sync 멱등 가드(전체 UNIQUE → 부분 UNIQUE).
--
-- V3 의 uq_ps_product_key 는 (product_id, spec_key) **전체** UNIQUE 라 soft-delete 행도 포함한다.
-- ProductSheetSyncService.loadSpecsForProduct 는 @SQLRestriction(is_deleted=false) 로 soft-delete 행을
-- 못 보고 upsert 하므로, 사양 값 churn(키 사라짐→재등장) 시 soft-deleted 행과 신규 active 행이
-- 전체 UNIQUE 를 위반 → 탭 sync 롤백한다. bundle_component(V11)·products(ux_*_active) 와 동일하게
-- 부분 UNIQUE(미삭제 행만)로 전환해 재등장 INSERT 를 허용한다. product_spec 은 아직 실 적재 0.

ALTER TABLE product_spec DROP CONSTRAINT IF EXISTS uq_ps_product_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_product_spec_active
    ON product_spec (product_id, spec_key)
    WHERE is_deleted = FALSE;
