-- V32: 구성품 수기 편집 세트의 시트 sync 덮어쓰기 보호
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS bundle_components_manual BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN products.bundle_components_manual IS
    '구성품 수기 편집 여부. TRUE 인 부모 BUNDLE 은 ProductSheetSyncService 구성품 sync 에서 보존한다.';
