ALTER TABLE journals ADD COLUMN IF NOT EXISTS cash_receipt_id UUID;

COMMENT ON COLUMN journals.cash_receipt_id IS '원천 입금보고서(CashReceipt) UUID — 원분개/역분개 모두 동일 CashReceipt 를 가리킨다. source_ref_id 과부하(역분개 시 원분개 id 로 덮어씀) 해소용 전용 링크. #771';

-- 기존 데이터 backfill: cash_receipts 의 권위 링크(journal_id=원, reverse_journal_id=역)로 원·역 저널 모두 채운다.
UPDATE journals j SET cash_receipt_id = cr.id
FROM cash_receipts cr
WHERE (cr.journal_id = j.id OR cr.reverse_journal_id = j.id)
  AND cr.is_deleted = false
  AND j.cash_receipt_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_journals_cash_receipt_id ON journals(cash_receipt_id) WHERE cash_receipt_id IS NOT NULL;
