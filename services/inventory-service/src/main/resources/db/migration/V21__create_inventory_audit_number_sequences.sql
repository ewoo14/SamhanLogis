-- V21__create_inventory_audit_number_sequences.sql
-- 재고 실사번호 yyyy/MM/dd-N 일자별 채번 시퀀스를 도입한다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS inventory_audit_number_sequences (
    id              UUID        PRIMARY KEY,
    audit_date      DATE        NOT NULL,
    last_seq        INTEGER     NOT NULL DEFAULT 0,
    version         BIGINT      NOT NULL DEFAULT 0,
    created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(50) NOT NULL DEFAULT 'system',
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
    CONSTRAINT ux_inventory_audit_number_sequences_date UNIQUE (audit_date)
);

COMMENT ON TABLE inventory_audit_number_sequences IS
    '재고 실사번호 yyyy/MM/dd-N 일자별 채번 시퀀스';

INSERT INTO inventory_audit_number_sequences
    (id, audit_date, last_seq, version, created_at, created_by, is_deleted)
SELECT gen_random_uuid(),
       to_date(split_part(audit_no, '-', 1), 'YYYY/MM/DD') AS audit_date,
       MAX(split_part(audit_no, '-', 2)::INTEGER) AS last_seq,
       0,
       CURRENT_TIMESTAMP,
       'system',
       FALSE
  FROM inventory_audits
 WHERE audit_no ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}-[0-9]+$'
 GROUP BY to_date(split_part(audit_no, '-', 1), 'YYYY/MM/DD')
ON CONFLICT (audit_date) DO UPDATE
    SET last_seq = GREATEST(inventory_audit_number_sequences.last_seq, EXCLUDED.last_seq),
        modified_at = CURRENT_TIMESTAMP,
        modified_by = 'system'
  WHERE inventory_audit_number_sequences.last_seq < EXCLUDED.last_seq;
