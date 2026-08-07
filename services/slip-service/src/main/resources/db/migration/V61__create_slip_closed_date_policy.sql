-- #1123 S1: 전표 종류별 날짜 마감 정책.
-- 날짜 하나마다 자동 행을 만들지 않고, 기준선 + 예외/명시 규칙으로 판정한다.

CREATE TABLE slip_closing_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slip_type VARCHAR(20) NOT NULL,
    baseline_date DATE NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(50) NOT NULL,
    modified_at TIMESTAMP,
    modified_by VARCHAR(50),
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(50),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE slip_closing_date_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slip_type VARCHAR(20) NOT NULL,
    closing_date DATE NOT NULL,
    rule_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(50) NOT NULL,
    modified_at TIMESTAMP,
    modified_by VARCHAR(50),
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(50),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX ux_slip_closing_baselines_type_active
    ON slip_closing_baselines (slip_type)
    WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX ux_slip_closing_date_rules_type_date_active
    ON slip_closing_date_rules (slip_type, closing_date)
    WHERE is_deleted = FALSE;

INSERT INTO slip_closing_baselines
    (slip_type, baseline_date, enabled, created_at, created_by, is_deleted)
VALUES
    ('OUTBOUND', CURRENT_DATE, FALSE, NOW(), 'v61-slip-closing-policy', FALSE),
    ('INBOUND', CURRENT_DATE, FALSE, NOW(), 'v61-slip-closing-policy', FALSE);
