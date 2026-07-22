-- 주문 품목행 공급가액·부가세 추가 (#900).
-- 기존 주문은 소급 재계산하지 않는다. 두 컬럼은 nullable legacy snapshot으로 남긴다.
ALTER TABLE partner_order_lines
    ADD COLUMN supply_amount NUMERIC(15,2),
    ADD COLUMN vat_amount NUMERIC(15,2);

-- 신규 금액 스냅샷은 S+V=T(subtotal)을 DB에서도 검증한다.
ALTER TABLE partner_order_lines
    ADD CONSTRAINT ck_partner_order_lines_amount_identity
    CHECK (
        (supply_amount IS NULL AND vat_amount IS NULL)
        OR (
            supply_amount IS NOT NULL
            AND vat_amount IS NOT NULL
            AND supply_amount + vat_amount = subtotal
        )
    );
