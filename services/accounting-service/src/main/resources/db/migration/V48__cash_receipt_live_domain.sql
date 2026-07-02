-- V48__cash_receipt_live_domain.sql
-- E3 S1 입금보고서 라이브 수기 CRUD + 상태 라이프사이클 기반.
--
-- 기존 MIG 적재분은 CONFIRMED 로 소급한다. 수기 생성은 애플리케이션에서 DRAFT 로 INSERT 된다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE cash_receipts
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED';

ALTER TABLE cash_receipts
    ADD COLUMN IF NOT EXISTS debit_account_code VARCHAR(20) NOT NULL DEFAULT '103';

ALTER TABLE cash_receipts
    ADD COLUMN IF NOT EXISTS credit_account_code VARCHAR(20) NOT NULL DEFAULT '110';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'cash_receipts_status_ck'
           AND conrelid = 'cash_receipts'::regclass
    ) THEN
        ALTER TABLE cash_receipts
            ADD CONSTRAINT cash_receipts_status_ck
            CHECK (status IN ('DRAFT', 'CONFIRMED', 'CANCELLED'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'cash_receipts_kind_ck'
           AND conrelid = 'cash_receipts'::regclass
    ) THEN
        ALTER TABLE cash_receipts
            ADD CONSTRAINT cash_receipts_kind_ck
            CHECK (kind IN ('DEPOSIT_REPORT', 'MANUAL_RECEIPT'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_cash_receipts_status
    ON cash_receipts (status)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS ix_cash_receipts_kind_status
    ON cash_receipts (kind, status)
    WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS cash_receipt_number_sequences (
    id              UUID        PRIMARY KEY,
    receipt_date    DATE        NOT NULL,
    last_seq        INTEGER     NOT NULL DEFAULT 0,
    version         BIGINT      NOT NULL DEFAULT 0,
    created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(50) NOT NULL DEFAULT 'system',
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
    CONSTRAINT ux_cash_receipt_number_sequences_date UNIQUE (receipt_date)
);

COMMENT ON TABLE cash_receipt_number_sequences IS
    '입금보고서 slip_no 일자별 채번 시퀀스';

-- collab-core enum 확장: 기존 V36 적용본은 document_type CHECK 를 inline unnamed 제약으로 갖는다.
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    FOR constraint_name IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
         WHERE t.relname = 'journal_collab_comments'
           AND c.contype = 'c'
           AND pg_get_constraintdef(c.oid) LIKE '%DISPATCH_TASK%'
           AND pg_get_constraintdef(c.oid) LIKE '%ACCOUNTING_VOUCHER%'
    LOOP
        EXECUTE format('ALTER TABLE journal_collab_comments DROP CONSTRAINT %I', constraint_name);
    END LOOP;
END $$;

ALTER TABLE journal_collab_comments
    ADD CONSTRAINT journal_collab_comments_document_type_ck
    CHECK (document_type IN (
        'DISPATCH_TASK',
        'SLIP_OUTBOUND',
        'SLIP_INBOUND',
        'ACCOUNTING_VOUCHER',
        'ACCOUNTING_CASH_RECEIPT',
        'PARTNER_ORDER',
        'ESTIMATE',
        'APPROVAL_LINE'
    ));

DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    FOR constraint_name IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
         WHERE t.relname = 'journal_collab_suggestions'
           AND c.contype = 'c'
           AND pg_get_constraintdef(c.oid) LIKE '%DISPATCH_TASK%'
           AND pg_get_constraintdef(c.oid) LIKE '%ACCOUNTING_VOUCHER%'
    LOOP
        EXECUTE format('ALTER TABLE journal_collab_suggestions DROP CONSTRAINT %I', constraint_name);
    END LOOP;
END $$;

ALTER TABLE journal_collab_suggestions
    ADD CONSTRAINT journal_collab_suggestions_document_type_ck
    CHECK (document_type IN (
        'DISPATCH_TASK',
        'SLIP_OUTBOUND',
        'SLIP_INBOUND',
        'ACCOUNTING_VOUCHER',
        'ACCOUNTING_CASH_RECEIPT',
        'PARTNER_ORDER',
        'ESTIMATE',
        'APPROVAL_LINE'
    ));
