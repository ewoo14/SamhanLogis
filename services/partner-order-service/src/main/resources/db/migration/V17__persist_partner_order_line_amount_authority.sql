ALTER TABLE partner_order_lines
    ADD COLUMN amount_authority VARCHAR(10) DEFAULT 'PRICE';

-- V12 이전/직후의 기존 S/V 행은 생성 경로를 DB만으로 구분할 수 없다.
-- 실측상 PRICE 생성이 확인된 행이 다수이고 VAT 생성은 확인되지 않았으므로,
-- 기존 행은 보수적으로 PRICE를 명시해 GET→PUT에서 VAT로 재추측되지 않게 한다.
UPDATE partner_order_lines
SET amount_authority = 'PRICE'
WHERE amount_authority IS NULL;

ALTER TABLE partner_order_lines
    ALTER COLUMN amount_authority SET NOT NULL;
