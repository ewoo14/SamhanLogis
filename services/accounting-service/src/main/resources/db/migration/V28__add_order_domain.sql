-- V28__add_order_domain.sql
-- MIG-8 이카운트 주문서 staging -> Order/OrderLine 도메인 변환 대상.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS orders (
    id                  UUID          NOT NULL DEFAULT gen_random_uuid(),
    order_no            VARCHAR(30)   NOT NULL,
    partner_id          UUID          NOT NULL,
    partner_name        VARCHAR(200)  NOT NULL,
    manager_name        VARCHAR(100),
    valid_until         DATE,
    payment_terms       TEXT,
    reference           TEXT,
    progress_status     VARCHAR(20)   NOT NULL,
    total_supply_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_vat_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,
    linked_slip_no      VARCHAR(30),
    external_ref        VARCHAR(100)  NOT NULL,
    kind                VARCHAR(20)   NOT NULL DEFAULT 'ECOUNT_MIG8',
    created_at          TIMESTAMP     NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(50)   NOT NULL DEFAULT 'system',
    modified_at         TIMESTAMP,
    modified_by         VARCHAR(50),
    deleted_at          TIMESTAMP,
    deleted_by          VARCHAR(50),
    is_deleted          BOOLEAN       NOT NULL DEFAULT FALSE,
    CONSTRAINT orders_pk PRIMARY KEY (id),
    CONSTRAINT orders_order_no_uk UNIQUE (order_no),
    CONSTRAINT orders_external_ref_uk UNIQUE (external_ref)
);

CREATE INDEX IF NOT EXISTS ix_orders_partner
    ON orders (partner_id);
CREATE INDEX IF NOT EXISTS ix_orders_progress_status
    ON orders (progress_status);
CREATE INDEX IF NOT EXISTS ix_orders_external_ref
    ON orders (external_ref);

CREATE TABLE IF NOT EXISTS order_lines (
    id              UUID          NOT NULL DEFAULT gen_random_uuid(),
    order_id        UUID          NOT NULL,
    line_no         INT           NOT NULL,
    product_id      UUID,
    item_name       VARCHAR(200)  NOT NULL,
    quantity        NUMERIC(15,3) NOT NULL,
    unit_price      NUMERIC(15,2) NOT NULL,
    supply_amount   NUMERIC(15,2) NOT NULL,
    vat_amount      NUMERIC(15,2) NOT NULL,
    item_due_date   DATE,
    created_at      TIMESTAMP     NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(50)   NOT NULL DEFAULT 'system',
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN       NOT NULL DEFAULT FALSE,
    CONSTRAINT order_lines_pk PRIMARY KEY (id),
    CONSTRAINT order_lines_order_fk FOREIGN KEY (order_id) REFERENCES orders (id),
    CONSTRAINT order_lines_order_line_uk UNIQUE (order_id, line_no)
);

CREATE INDEX IF NOT EXISTS ix_order_lines_order
    ON order_lines (order_id);
CREATE INDEX IF NOT EXISTS ix_order_lines_product
    ON order_lines (product_id);
