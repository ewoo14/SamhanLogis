-- V7__add_product_aliases_and_ecount_staging.sql
-- MIG-2 이카운트 품목/품목관계/품목계층그룹 3-Tier 적재 + alias lookup map.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS staging;

ALTER TABLE products ALTER COLUMN product_code TYPE VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS ux_products_product_code_mig2_active
    ON products (product_code)
    WHERE is_deleted = FALSE;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS category_group      VARCHAR(100),
    ADD COLUMN IF NOT EXISTS tax_type            VARCHAR(20) NOT NULL DEFAULT 'TAXABLE',
    ADD COLUMN IF NOT EXISTS unit_price_with_vat NUMERIC(15,2) NOT NULL DEFAULT 0;

ALTER TABLE products
    DROP CONSTRAINT IF EXISTS chk_products_tax_type;
ALTER TABLE products
    ADD CONSTRAINT chk_products_tax_type CHECK (tax_type IN ('TAXABLE', 'ZERO_RATED', 'EXEMPT'));

INSERT INTO categories (id, code, name, parent_id, display_order, created_at, created_by, is_deleted)
VALUES ('00000000-0000-0000-0000-000000001099', 'ECOUNT_MIG2', '이카운트 MIG-2 품목', NULL, 99, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS product_aliases (
    id              UUID         NOT NULL DEFAULT gen_random_uuid(),
    alias_code      VARCHAR(100) NOT NULL,
    main_product_id UUID         NOT NULL REFERENCES products(id),
    source          VARCHAR(30)  NOT NULL DEFAULT 'ECOUNT_IMPORT',
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(50)  NOT NULL DEFAULT 'system',
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT product_aliases_pk PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_product_aliases_alias_active
    ON product_aliases (alias_code)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS ix_product_aliases_main_active
    ON product_aliases (main_product_id)
    WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS staging.ecount_item_raw (
    source_file_hash        VARCHAR(64) NOT NULL,
    source_row_no           INT         NOT NULL,
    raw_item_code           TEXT,
    raw_item_name           TEXT,
    raw_outbound_price      TEXT,
    raw_inbound_price       TEXT,
    raw_single_price        TEXT,
    raw_outdoor_price       TEXT,
    raw_multi_50_price      TEXT,
    raw_multi_48_price      TEXT,
    raw_multi_45_price      TEXT,
    raw_item_35_price       TEXT,
    raw_item_type           TEXT,
    raw_specification       TEXT,
    raw_usage_flag          TEXT,
    transform_status        VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    target_product_id       UUID,
    target_main_product_id  UUID,
    reject_reason           TEXT,
    imported_at             TIMESTAMP   NOT NULL DEFAULT NOW(),
    imported_by             VARCHAR(50) NOT NULL,
    PRIMARY KEY (source_file_hash, source_row_no),
    CONSTRAINT chk_ecount_item_raw_transform_status CHECK (
        transform_status IN ('PENDING', 'IMPORTED', 'UPDATED', 'REJECT_NAME_NULL',
                             'SKIPPED_PLACEHOLDER', 'SKIPPED_RELATION_ORPHAN')
    )
);

CREATE INDEX IF NOT EXISTS ix_ecount_item_raw_status
    ON staging.ecount_item_raw (transform_status);

CREATE INDEX IF NOT EXISTS ix_ecount_item_raw_code
    ON staging.ecount_item_raw (raw_item_code);

CREATE TABLE IF NOT EXISTS staging.ecount_item_relation_raw (
    source_file_hash            VARCHAR(64) NOT NULL,
    source_row_no               INT         NOT NULL,
    raw_main_item_code          TEXT,
    raw_main_item_name          TEXT,
    raw_main_item_unit          TEXT,
    raw_linked_item_code        TEXT,
    raw_linked_item_name        TEXT,
    raw_linked_item_unit        TEXT,
    raw_linked_conversion_qty   TEXT,
    raw_main_conversion_qty     TEXT,
    raw_quantity_basis          TEXT,
    transform_status            VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    reject_reason               TEXT,
    imported_at                 TIMESTAMP   NOT NULL DEFAULT NOW(),
    imported_by                 VARCHAR(50) NOT NULL,
    PRIMARY KEY (source_file_hash, source_row_no)
);

CREATE TABLE IF NOT EXISTS staging.ecount_item_group_raw (
    source_file_hash    VARCHAR(64) NOT NULL,
    source_row_no       INT         NOT NULL,
    raw_group_level     TEXT,
    raw_group_name      TEXT,
    raw_item_code       TEXT,
    raw_item_name       TEXT,
    imported_at         TIMESTAMP   NOT NULL DEFAULT NOW(),
    imported_by         VARCHAR(50) NOT NULL,
    PRIMARY KEY (source_file_hash, source_row_no)
);

CREATE TABLE IF NOT EXISTS staging.ecount_item_alias (
    alias_code          VARCHAR(100) PRIMARY KEY,
    main_item_code      VARCHAR(100) NOT NULL,
    main_product_uuid   UUID         NOT NULL,
    source_file_hash    VARCHAR(64)  NOT NULL,
    source_row_no       INT,
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_ecount_item_alias_main_product
    ON staging.ecount_item_alias (main_product_uuid);
