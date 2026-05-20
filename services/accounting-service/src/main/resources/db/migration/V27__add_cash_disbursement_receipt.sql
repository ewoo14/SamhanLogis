-- V27__add_cash_disbursement_receipt.sql
-- MIG-7 이카운트 지출결의서/입금보고서 staging -> Cash 도메인 변환 대상.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS cash_disbursements (
    id                  UUID          NOT NULL DEFAULT gen_random_uuid(),
    slip_no             VARCHAR(30)   NOT NULL,
    partner_id          UUID          NOT NULL,
    amount              NUMERIC(15,2) NOT NULL,
    transaction_date    DATE          NOT NULL,
    kind                VARCHAR(30)   NOT NULL,
    memo                TEXT,
    journal_id          UUID,
    external_ref        VARCHAR(100)  NOT NULL,
    created_at          TIMESTAMP     NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(50)   NOT NULL DEFAULT 'system',
    modified_at         TIMESTAMP,
    modified_by         VARCHAR(50),
    deleted_at          TIMESTAMP,
    deleted_by          VARCHAR(50),
    is_deleted          BOOLEAN       NOT NULL DEFAULT FALSE,
    CONSTRAINT cash_disbursements_pk PRIMARY KEY (id),
    CONSTRAINT cash_disbursements_slip_no_uk UNIQUE (slip_no),
    CONSTRAINT cash_disbursements_external_ref_uk UNIQUE (external_ref)
);

CREATE INDEX IF NOT EXISTS ix_cash_disbursements_partner
    ON cash_disbursements (partner_id);
CREATE INDEX IF NOT EXISTS ix_cash_disbursements_transaction_date
    ON cash_disbursements (transaction_date);
CREATE INDEX IF NOT EXISTS ix_cash_disbursements_external_ref
    ON cash_disbursements (external_ref);

CREATE TABLE IF NOT EXISTS cash_receipts (
    id                  UUID          NOT NULL DEFAULT gen_random_uuid(),
    slip_no             VARCHAR(30)   NOT NULL,
    partner_id          UUID          NOT NULL,
    amount              NUMERIC(15,2) NOT NULL,
    transaction_date    DATE          NOT NULL,
    kind                VARCHAR(30)   NOT NULL,
    memo                TEXT,
    journal_id          UUID,
    external_ref        VARCHAR(100)  NOT NULL,
    created_at          TIMESTAMP     NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(50)   NOT NULL DEFAULT 'system',
    modified_at         TIMESTAMP,
    modified_by         VARCHAR(50),
    deleted_at          TIMESTAMP,
    deleted_by          VARCHAR(50),
    is_deleted          BOOLEAN       NOT NULL DEFAULT FALSE,
    CONSTRAINT cash_receipts_pk PRIMARY KEY (id),
    CONSTRAINT cash_receipts_slip_no_uk UNIQUE (slip_no),
    CONSTRAINT cash_receipts_external_ref_uk UNIQUE (external_ref)
);

CREATE INDEX IF NOT EXISTS ix_cash_receipts_partner
    ON cash_receipts (partner_id);
CREATE INDEX IF NOT EXISTS ix_cash_receipts_transaction_date
    ON cash_receipts (transaction_date);
CREATE INDEX IF NOT EXISTS ix_cash_receipts_external_ref
    ON cash_receipts (external_ref);
