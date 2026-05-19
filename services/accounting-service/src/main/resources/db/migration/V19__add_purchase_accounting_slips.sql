-- V19: SP-SAS-2 PurchaseAccountingSlip 도메인 — 입고전표 → 매입전표(회계분개)
-- spec: docs/superpowers/specs/2026-05-19-sales-purchase-accounting-slip-design.md §3

CREATE TABLE purchase_accounting_slips (
    id UUID PRIMARY KEY,
    slip_no VARCHAR(50) NOT NULL UNIQUE,
    slip_date DATE NOT NULL,
    partner_id UUID NOT NULL,
    partner_code VARCHAR(100) NOT NULL,
    partner_name VARCHAR(200) NOT NULL,
    tax_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    total_supply_amount NUMERIC(15,2) NOT NULL,
    total_vat_amount NUMERIC(15,2) NOT NULL,
    total_amount NUMERIC(15,2) NOT NULL,
    posted_at TIMESTAMP,
    posted_by VARCHAR(100),
    tax_invoice_id UUID,
    memo TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL,
    modified_at TIMESTAMP NOT NULL DEFAULT NOW(),
    modified_by VARCHAR(100) NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(100),
    version BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT chk_pas_tax_type CHECK (tax_type IN ('TAXABLE', 'ZERO_RATED', 'EXEMPT')),
    CONSTRAINT chk_pas_status CHECK (status IN ('DRAFT', 'POSTED', 'VOIDED'))
);

CREATE INDEX idx_pas_slip_date ON purchase_accounting_slips(slip_date) WHERE is_deleted = FALSE;
CREATE INDEX idx_pas_partner_id ON purchase_accounting_slips(partner_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_pas_status ON purchase_accounting_slips(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_pas_tax_invoice_id ON purchase_accounting_slips(tax_invoice_id) WHERE is_deleted = FALSE;

CREATE TABLE purchase_accounting_slip_lines (
    id UUID PRIMARY KEY,
    slip_id UUID NOT NULL REFERENCES purchase_accounting_slips(id),
    line_no INT NOT NULL,
    product_code VARCHAR(100),
    product_name VARCHAR(200),
    qty NUMERIC(12,3) NOT NULL,
    unit_price NUMERIC(15,2) NOT NULL,
    supply_amount NUMERIC(15,2) NOT NULL,
    vat_amount NUMERIC(15,2) NOT NULL,
    line_total NUMERIC(15,2) NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL,
    modified_at TIMESTAMP NOT NULL DEFAULT NOW(),
    modified_by VARCHAR(100) NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(100),
    version BIGINT NOT NULL DEFAULT 0,

    UNIQUE (slip_id, line_no)
);

CREATE INDEX idx_pas_line_slip_id ON purchase_accounting_slip_lines(slip_id) WHERE is_deleted = FALSE;

CREATE TABLE purchase_accounting_slip_allocations (
    id UUID PRIMARY KEY,
    purchase_slip_line_id UUID NOT NULL REFERENCES purchase_accounting_slip_lines(id),
    source_slip_id UUID NOT NULL,
    source_slip_no VARCHAR(50) NOT NULL,
    source_line_id UUID NOT NULL,
    source_line_no INT NOT NULL,
    allocated_qty NUMERIC(12,3) NOT NULL,
    allocated_amount NUMERIC(15,2) NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL,
    modified_at TIMESTAMP NOT NULL DEFAULT NOW(),
    modified_by VARCHAR(100) NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(100),
    version BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_pas_alloc_source ON purchase_accounting_slip_allocations(source_slip_id, source_line_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_pas_alloc_slip_line ON purchase_accounting_slip_allocations(purchase_slip_line_id) WHERE is_deleted = FALSE;

CREATE OR REPLACE VIEW v_inbound_slip_allocation AS
SELECT
    source_slip_id,
    source_line_id,
    SUM(allocated_qty)    AS allocated_qty_sum,
    SUM(allocated_amount) AS allocated_amount_sum
FROM purchase_accounting_slip_allocations
WHERE is_deleted = FALSE
GROUP BY source_slip_id, source_line_id;
