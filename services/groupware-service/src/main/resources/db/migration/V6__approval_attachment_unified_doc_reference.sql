-- V6__approval_attachment_unified_doc_reference.sql
-- §7 그룹웨어 결재 첨부 통합 문서 참조: 기존 refSlip/refPartner 컬럼은 보존하고 refDoc* 로 일반화한다.

ALTER TABLE approval_attachments
    ADD COLUMN IF NOT EXISTS ref_doc_type VARCHAR(30);

ALTER TABLE approval_attachments
    ADD COLUMN IF NOT EXISTS ref_doc_no VARCHAR(40);

ALTER TABLE approval_attachments
    ADD COLUMN IF NOT EXISTS ref_doc_label VARCHAR(200);

UPDATE approval_attachments
SET ref_doc_type = CASE
        WHEN attachment_type = 'SLIP_REF'
             AND UPPER(COALESCE(ref_slip_type, '')) LIKE '%INBOUND%' THEN 'INBOUND_SLIP'
        WHEN attachment_type = 'SLIP_REF' THEN 'OUTBOUND_SLIP'
        WHEN attachment_type = 'PARTNER_LEDGER_REF' THEN 'PARTNER_LEDGER'
        ELSE ref_doc_type
    END
WHERE ref_doc_type IS NULL
  AND attachment_type IN ('SLIP_REF', 'PARTNER_LEDGER_REF');

UPDATE approval_attachments
SET ref_doc_no = ref_slip_no
WHERE ref_doc_no IS NULL
  AND attachment_type = 'SLIP_REF'
  AND ref_slip_no IS NOT NULL;

UPDATE approval_attachments
SET ref_doc_label = COALESCE(ref_partner_name, label)
WHERE ref_doc_label IS NULL
  AND attachment_type IN ('SLIP_REF', 'PARTNER_LEDGER_REF');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_approval_attachments_ref_doc_type'
    ) THEN
        ALTER TABLE approval_attachments
            ADD CONSTRAINT ck_approval_attachments_ref_doc_type
            CHECK (
                ref_doc_type IS NULL
                OR ref_doc_type IN (
                    'OUTBOUND_SLIP',
                    'INBOUND_SLIP',
                    'JOURNAL',
                    'TAX_INVOICE',
                    'STATEMENT',
                    'PARTNER_LEDGER'
                )
            );
    END IF;
END $$;
