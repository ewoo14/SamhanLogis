ALTER TABLE cash_receipts
    ADD COLUMN IF NOT EXISTS reverse_journal_id UUID;

COMMENT ON COLUMN cash_receipts.reverse_journal_id IS
    '입금보고서 취소 시 생성된 역분개 Journal UUID. API 응답은 journal_no 문자열로만 노출한다.';
