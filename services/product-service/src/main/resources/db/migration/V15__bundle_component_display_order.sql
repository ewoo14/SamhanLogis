-- V15__bundle_component_display_order.sql
-- 2026-06-11 — BUNDLE 구성품 표시 순서 컬럼 추가 (§2-4 P2-4).
--
-- ProductCatalogController.replaceComponents PUT 요청 시 배열 인덱스(1-based) 를
-- display_order 에 기록하여 GET 시 결정적 순서를 보장한다.
-- NULL 허용 + ORDER BY NULLS LAST — 기존 행(시트 sync 적재) 은 NULL 로 유지되며
-- 다음 replace-all 호출 전까지 후순위 처리된다.
-- bundle_component 의 실 데이터 적재는 시트 sync 경유이므로 기존 데이터 충돌 없음.

ALTER TABLE bundle_component ADD COLUMN IF NOT EXISTS display_order INTEGER;

COMMENT ON COLUMN bundle_component.display_order IS
    '구성품 표시 순서(replace-all PUT 시 배열 1-based 인덱스 기록). NULL = 시트 sync 행(미설정) → ORDER BY NULLS LAST 후순위';

-- 기존 행 backfill (bundle_product_id 기준 row_number — 임의이나 안정적 초기값)
-- 운영 데이터가 없으므로 단순 backfill.
UPDATE bundle_component bc
   SET display_order = ranked.rn
  FROM (
       SELECT id,
              ROW_NUMBER() OVER (PARTITION BY bundle_product_id ORDER BY created_at, id) AS rn
         FROM bundle_component
        WHERE is_deleted = FALSE
       ) ranked
 WHERE bc.id = ranked.id
   AND bc.is_deleted = FALSE
   AND bc.display_order IS NULL;

-- 표시 순서 조회 인덱스 (findByBundleProductId ORDER BY display_order ASC NULLS LAST)
CREATE INDEX IF NOT EXISTS ix_bundle_component_order
    ON bundle_component (bundle_product_id, display_order NULLS LAST)
    WHERE is_deleted = FALSE;
