-- 복원 불가 UUID-only 전표는 삭제하지 않고 목록·집계에서 격리한다.
CREATE TABLE slip_partner_integrity_quarantine (
    id UUID PRIMARY KEY,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(50) NOT NULL,
    modified_at TIMESTAMP,
    modified_by VARCHAR(50),
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(50),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    slip_id UUID NOT NULL,
    slip_no VARCHAR(30) NOT NULL,
    partner_id UUID NOT NULL,
    partner_code VARCHAR(50),
    slip_status VARCHAR(20) NOT NULL,
    reason TEXT NOT NULL,
    source VARCHAR(40) NOT NULL,
    restored_at TIMESTAMP,
    restored_by VARCHAR(50),
    restored_partner_code VARCHAR(50),
    CONSTRAINT ux_slip_partner_integrity_quarantine_slip UNIQUE (slip_id)
);

CREATE INDEX ix_slip_partner_integrity_quarantine_pending
    ON slip_partner_integrity_quarantine (slip_no)
    WHERE is_deleted = FALSE AND restored_at IS NULL;
