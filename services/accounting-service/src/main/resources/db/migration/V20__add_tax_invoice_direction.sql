-- V20: TaxInvoice direction 확장 — OUTBOUND(기존 발행) / INBOUND(수신)
ALTER TABLE tax_invoices
    ADD COLUMN direction VARCHAR(20) NOT NULL DEFAULT 'OUTBOUND';

ALTER TABLE tax_invoices
    ADD CONSTRAINT chk_ti_direction CHECK (direction IN ('OUTBOUND', 'INBOUND'));

CREATE INDEX idx_ti_direction
    ON tax_invoices(direction)
    WHERE is_deleted = FALSE;

-- 수신 세금계산서 첨부 파일 (수동 등록 PDF/이미지 metadata, MinIO object key stub)
CREATE TABLE inbound_tax_invoice_attachments (
    id UUID PRIMARY KEY,
    tax_invoice_id UUID NOT NULL REFERENCES tax_invoices(id),
    filename VARCHAR(255) NOT NULL,
    minio_object_key VARCHAR(500) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL,
    modified_at TIMESTAMP NOT NULL DEFAULT NOW(),
    modified_by VARCHAR(100) NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(100),
    version BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_inbound_ti_att_ti
    ON inbound_tax_invoice_attachments(tax_invoice_id)
    WHERE is_deleted = FALSE;
