-- V53__bank_linked_cash_receipt.sql
-- E3 S3 통장거래 N건 -> BANK_LINKED 입금보고서 1건 연결.
--
-- 적용 원칙:
--   * V48~V52 적용 마이그레이션은 수정하지 않고 신규 V53 에서만 enum CHECK 를 확장한다.
--   * bank_transaction row UUID 는 내부 join 키이며 API/화면에는 노출하지 않는다.

ALTER TABLE bank_transaction
    ADD COLUMN IF NOT EXISTS cash_receipt_id UUID;

COMMENT ON COLUMN bank_transaction.cash_receipt_id IS
    '통장연계 입금보고서 CashReceipt UUID. API 응답은 slip_no 문자열만 노출한다.';

CREATE INDEX IF NOT EXISTS idx_bank_transaction_cash_receipt
    ON bank_transaction (cash_receipt_id)
    WHERE is_deleted = FALSE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'bank_transaction_cash_receipt_fk'
           AND conrelid = 'bank_transaction'::regclass
    ) THEN
        ALTER TABLE bank_transaction
            ADD CONSTRAINT bank_transaction_cash_receipt_fk
            FOREIGN KEY (cash_receipt_id) REFERENCES cash_receipts(id)
            ON DELETE SET NULL;
    END IF;
END $$;

ALTER TABLE cash_receipts
    DROP CONSTRAINT IF EXISTS cash_receipts_kind_ck;

ALTER TABLE cash_receipts
    ADD CONSTRAINT cash_receipts_kind_ck
    CHECK (kind IN ('DEPOSIT_REPORT', 'MANUAL_RECEIPT', 'BANK_LINKED'));
