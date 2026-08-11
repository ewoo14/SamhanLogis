-- V19: 영업수수료 정산서 결재 참조와 역방향 조회.
-- 기존 참조/첨부 값과 기존 행은 변경하지 않고 ref_doc_type CHECK만 확장한다.

ALTER TABLE approval_attachments
    DROP CONSTRAINT IF EXISTS ck_approval_attachments_ref_doc_type;

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
            'PARTNER_LEDGER',
            'SALES_COMMISSION_SETTLEMENT'
        )
    );

-- 정산서에서 연결 결재를 찾는 역방향 조회용. soft-delete 행은 대상이 아니다.
CREATE INDEX IF NOT EXISTS ix_approval_attachments_ref_doc_active
    ON approval_attachments (ref_doc_type, ref_doc_no)
    WHERE is_deleted = FALSE;
