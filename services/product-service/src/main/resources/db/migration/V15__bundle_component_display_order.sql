-- V15__bundle_component_display_order.sql
-- 2026-06-11 — BUNDLE 구성품 표시 순서 컬럼 추가 (§2-4 P2-4).
--
-- ProductCatalogController.replaceComponents PUT 요청 시 배열 인덱스(1-based) 를
-- display_order 에 기록하여 GET 시 결정적 순서를 보장한다.
-- NULL 허용 + ORDER BY NULLS LAST.
--
-- backfill 동작 (#11 헤더 정정):
--   * 마이그레이션 시점 기존 활성 행은 (bundle_product_id PARTITION) created_at,id 기준
--     ROW_NUMBER 로 backfill 하여 결정적 초기 순서를 부여한다(아래 UPDATE 문).
--   * 마이그레이션 이후 시트 sync 가 신규 적재하는 구성품 행은 display_order 를 설정하지 않으므로
--     NULL 로 남고, ORDER BY display_order ASC NULLS LAST 로 backfill 군 뒤에 후순위 정렬된다.
--   * 즉 '기존 행은 NULL 유지'가 아니라 '기존 활성 행은 backfill, 이후 sync 신규 행만 NULL/NULLS LAST 후순위'.
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

-- #15 잉여 인덱스 제거: V3 의 ix_bc_bundle(bundle_product_id 단일, 전체 행) 은
-- 신규 ix_bundle_component_order(bundle_product_id, display_order; is_deleted=false 부분) 가
-- 선두 컬럼 동일 + is_deleted=false 필터(@SQLRestriction 으로 모든 조회가 적용) 기준 prefix
-- 상위호환이라 중복이다. 쓰기 비용 절감 위해 제거한다.
DROP INDEX IF EXISTS ix_bc_bundle;
