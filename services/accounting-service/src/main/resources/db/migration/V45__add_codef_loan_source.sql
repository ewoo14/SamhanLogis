-- V45__add_codef_loan_source.sql
-- BC1 CODEF 대출 거래내역 source 확장 + 대출 식별 필드.
--
-- 적용 원칙:
--   * V44 는 이미 적용된 마이그레이션이므로 수정하지 않는다.
--   * enum 영속 값 확장 시 CHECK 제약을 새 버전에서 재정의한다.

ALTER TABLE bank_transaction
    ADD COLUMN IF NOT EXISTS loan_name VARCHAR(100);

ALTER TABLE bank_transaction
    DROP CONSTRAINT IF EXISTS bank_transaction_source_check;

ALTER TABLE bank_transaction
    ADD CONSTRAINT bank_transaction_source_check
        CHECK (source IN ('CSV_IMPORT', 'KFTC', 'CODEF_BANK', 'CODEF_CARD', 'CODEF_LOAN'));

COMMENT ON COLUMN bank_transaction.loan_name IS
    'CODEF 대출 거래의 대출명. 은행/카드 거래는 NULL';
