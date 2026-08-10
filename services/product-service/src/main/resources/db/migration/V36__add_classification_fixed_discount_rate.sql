-- #1090: 품목 분류 단계별 정액DC율. null 은 해당 단계 미지정이다.
ALTER TABLE classification
    ADD COLUMN fixed_discount_rate NUMERIC(5, 2);

ALTER TABLE classification
    ADD CONSTRAINT chk_classification_fixed_discount_rate_pct
    CHECK (fixed_discount_rate IS NULL OR (fixed_discount_rate >= 0 AND fixed_discount_rate <= 100));
