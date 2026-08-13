-- #1143 구성품별 자동/고정·비중·반올림 데이터화.
-- 기존 BundleExpander 계산은 이번 migration에서 전환하지 않는다. V39는 계약 저장과
-- 레거시 초기값 backfill만 수행하여 기존 271 싱글세트 금액을 보존한다.

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS allocation_round_unit NUMERIC(19, 0) NOT NULL DEFAULT 1000;

ALTER TABLE bundle_component
    ADD COLUMN IF NOT EXISTS allocation_mode VARCHAR(8) NOT NULL DEFAULT 'FIXED',
    ADD COLUMN IF NOT EXISTS allocation_weight INTEGER,
    ADD COLUMN IF NOT EXISTS fixed_allocation_amount NUMERIC(19, 2);

COMMENT ON COLUMN products.allocation_round_unit IS '세트 구성품 자동 배분 반올림 단위(원)';
COMMENT ON COLUMN bundle_component.allocation_mode IS 'AUTO 또는 FIXED';
COMMENT ON COLUMN bundle_component.allocation_weight IS 'AUTO 구성품 비중(1 이상 9 이하), 세트 합계 10';
COMMENT ON COLUMN bundle_component.fixed_allocation_amount IS 'FIXED 구성품의 세트 문맥 고정 금액(원)';

-- 먼저 모든 활성 구성품을 고정으로 초기화한다. 상업멀티는 기존처럼 전역 구성품
-- 단가를 그대로 사용하므로 이 값이 레거시 계약과 동일하다.
UPDATE bundle_component bc
   SET allocation_mode = 'FIXED',
       allocation_weight = NULL,
       fixed_allocation_amount = COALESCE((
           SELECT cp.delivery_price
             FROM products cp
            WHERE cp.model_code = bc.component_product_code
              AND cp.is_deleted = FALSE
       ), 0)
 WHERE bc.is_deleted = FALSE;

-- 싱글세트의 기존 4:6(비가정)·6:4(가정) 본체 배분을 구성품별 비중으로 기록한다.
-- 기존 계산기는 이 값을 아직 소비하지 않으므로 backfill 자체가 금액을 바꾸지 않는다.
UPDATE bundle_component bc
   SET allocation_mode = 'AUTO',
       allocation_weight = CASE
           WHEN bc.component_kind = 'INDOOR'
            AND lower(COALESCE(parent.name, '') || ' ' || COALESCE(parent.model_code, '')) ~ '가정용'
             THEN 6
           WHEN bc.component_kind = 'OUTDOOR'
            AND lower(COALESCE(parent.name, '') || ' ' || COALESCE(parent.model_code, '')) ~ '가정용'
             THEN 4
           WHEN bc.component_kind = 'INDOOR' THEN 4
           WHEN bc.component_kind = 'OUTDOOR' THEN 6
           ELSE NULL
       END,
       fixed_allocation_amount = NULL
  FROM products parent
 WHERE parent.id = bc.bundle_product_id
   AND parent.is_deleted = FALSE
   AND parent.product_category = 'SINGLE_SET'
   AND parent.bundle_mode = 'EXPAND'
   AND bc.is_deleted = FALSE
   AND bc.component_kind IN ('INDOOR', 'OUTDOOR');

ALTER TABLE products
    ADD CONSTRAINT ck_products_allocation_round_unit_positive
    CHECK (allocation_round_unit > 0);

ALTER TABLE bundle_component
    ADD CONSTRAINT ck_bundle_component_allocation_mode
    CHECK (allocation_mode IN ('AUTO', 'FIXED'));

ALTER TABLE bundle_component
    ADD CONSTRAINT ck_bundle_component_allocation_weight
    CHECK (allocation_weight IS NULL OR allocation_weight BETWEEN 1 AND 9);
