-- #991 슬2: 주문에서 전환된 판매전표 라인의 GAS 카테고리 축 보존.
-- 수동/레거시 라인은 null을 유지하며 기존 행 backfill은 하지 않는다.
ALTER TABLE slip_lines
    ADD COLUMN IF NOT EXISTS category_key VARCHAR(40);
