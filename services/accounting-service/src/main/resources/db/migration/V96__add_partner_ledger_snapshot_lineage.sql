-- R33: 복원본 재저장 lineage를 보관한다. 기존 snapshot은 null로 호환한다.
ALTER TABLE tax_invoice_batches
    ADD COLUMN IF NOT EXISTS source_batch_no VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_tax_invoice_batches_source_batch_no
    ON tax_invoice_batches (source_batch_no);
