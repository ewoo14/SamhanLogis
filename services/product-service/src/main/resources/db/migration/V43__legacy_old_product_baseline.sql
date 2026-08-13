-- #1140 결정 B: 활성 구형 품목의 현재 단가를 baseline으로 복제한다.
-- 기존 견적/전표 테이블은 읽지 않으며 소급 계산하지 않는다.
INSERT INTO price_history (
    id, product_id, effective_date, release_price, delivery_price,
    set_material_key, created_at, created_by, is_deleted
)
SELECT
    gen_random_uuid(),
    p.id,
    DATE '2000-01-01',
    p.release_price,
    p.delivery_price,
    p.set_material_key,
    now(),
    'V43_LEGACY_BASELINE',
    FALSE
FROM products p
WHERE p.is_deleted = FALSE
  AND p.status = 'ACTIVE'
  AND p.product_category = 'OLD'
  AND NOT EXISTS (
      SELECT 1
      FROM price_history h
      WHERE h.product_id = p.id
        AND h.effective_date = DATE '2000-01-01'
        AND h.is_deleted = FALSE
  );
