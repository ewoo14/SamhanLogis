-- V13: 시트 노출 순서 보존 — display_order. 개발책임자 결정(2026-06-10):
-- "구글 시트의 노출 순서 그대로 유지" — 견적서/주문서 품목 리스트가 시트 row 순서로 표시.
-- sync 가 각 시트 탭의 데이터 행 순서(1부터)를 display_order 로 적재한다.
-- 기존 row 는 DEFAULT NULL → 다음 sync 1회에 채워짐(legacy 호환, 정렬 시 NULL 후순위).
ALTER TABLE products ADD COLUMN display_order INTEGER;
COMMENT ON COLUMN products.display_order IS '시트 노출 순서(탭 내 데이터 행 순번, sync 적재) — 견적/주문 품목 리스트 정렬 기준';

-- 카테고리별 노출 순서 정렬 인덱스 (estimate 카탈로그 ORDER BY display_order)
CREATE INDEX ix_products_category_display_order
    ON products (product_category, display_order)
    WHERE is_deleted = FALSE;
