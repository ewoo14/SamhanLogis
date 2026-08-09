-- #1095 — 시트 원문 상태를 제품 상태 축으로 승격한다.
-- V33은 열린 PR #1152에서 사용 중이므로 V34를 사용한다.
ALTER TABLE products
    ADD CONSTRAINT ck_products_status
    CHECK (status IN ('ACTIVE', 'DISCONTINUED', 'NOT_FOR_SALE', 'OUT_OF_STOCK'));
