-- 문서 자동 저장·이력 공통 계약: 기존 홈택스 배치 테이블을 문서 스냅샷 저장소로 재사용한다.
ALTER TABLE tax_invoice_batches ADD COLUMN IF NOT EXISTS document_type VARCHAR(30);
ALTER TABLE tax_invoice_batches ADD COLUMN IF NOT EXISTS document_key VARCHAR(100);
UPDATE tax_invoice_batches SET document_type = 'HOMETAX' WHERE document_type IS NULL;
ALTER TABLE tax_invoice_batches ALTER COLUMN document_type SET DEFAULT 'HOMETAX';
ALTER TABLE tax_invoice_batches ALTER COLUMN document_type SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tax_invoice_batches_document_history
    ON tax_invoice_batches (document_type, document_key, source_from_date, source_to_date, processed_at DESC);
