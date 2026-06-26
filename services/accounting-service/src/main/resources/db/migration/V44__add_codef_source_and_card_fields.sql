-- V44__add_codef_source_and_card_fields.sql
-- BC1 CODEF 은행·카드 거래내역 source 확장 + 카드 승인 필드.
--
-- 적용 원칙:
--   * enum 영속 값 확장 시 CHECK 제약을 함께 갱신한다.
--   * 기존 active unique index (bank_account_label, transacted_at, amount, external_ref)
--     WHERE is_deleted = FALSE 는 변경하지 않는다.

ALTER TABLE bank_transaction
    ADD COLUMN IF NOT EXISTS card_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS approval_id VARCHAR(128);

ALTER TABLE bank_transaction
    DROP CONSTRAINT IF EXISTS bank_transaction_source_check;

ALTER TABLE bank_transaction
    ADD CONSTRAINT bank_transaction_source_check
        CHECK (source IN ('CSV_IMPORT', 'KFTC', 'CODEF_BANK', 'CODEF_CARD'));

COMMENT ON COLUMN bank_transaction.card_name IS
    'CODEF 카드 승인 거래의 카드명. 은행 거래는 NULL';
COMMENT ON COLUMN bank_transaction.approval_id IS
    'CODEF 카드 승인번호. 카드 거래 externalRef 보조 식별자';
