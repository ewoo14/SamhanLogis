-- 부모 세트·구성품 pair별 시트 단가. NULL은 dual-read fallback을 의미한다.
ALTER TABLE bundle_component
    ADD COLUMN IF NOT EXISTS context_release_price NUMERIC(19, 2),
    ADD COLUMN IF NOT EXISTS context_delivery_price NUMERIC(19, 2);

COMMENT ON COLUMN bundle_component.context_release_price IS '부모 세트 문맥 구성품 출고가(원), NULL이면 전역 가격 fallback';
COMMENT ON COLUMN bundle_component.context_delivery_price IS '부모 세트 문맥 구성품 납품가(원), NULL이면 전역 products.delivery_price fallback';

ALTER TABLE bundle_component
    ADD CONSTRAINT ck_bundle_component_context_release_price
        CHECK (context_release_price IS NULL OR context_release_price >= 0),
    ADD CONSTRAINT ck_bundle_component_context_delivery_price
        CHECK (context_delivery_price IS NULL OR context_delivery_price >= 0);
