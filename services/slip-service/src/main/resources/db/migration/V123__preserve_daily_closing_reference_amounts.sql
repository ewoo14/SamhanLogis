-- 일마감 편집 열의 출고가·할인율을 원본 상품 가격과 분리해 보존한다.
ALTER TABLE slip_lines ADD COLUMN IF NOT EXISTS daily_closing_release_price NUMERIC(17, 2);
ALTER TABLE slip_lines ADD COLUMN IF NOT EXISTS daily_closing_discount_rate NUMERIC(30, 18);
COMMENT ON COLUMN slip_lines.daily_closing_release_price IS '일마감 금액 편집 시 사용자가 확정한 출고가';
COMMENT ON COLUMN slip_lines.daily_closing_discount_rate IS '일마감 할인율 저장값(소수: 50%=0.5)';
