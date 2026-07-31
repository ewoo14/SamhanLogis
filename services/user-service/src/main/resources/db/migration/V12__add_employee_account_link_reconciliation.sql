-- V12 — 직원 account_id 연결 계획과 건별 근거 보존
CREATE TABLE employee_account_link_reconciliations (
    id                UUID         PRIMARY KEY,
    plan_key          VARCHAR(40)  NOT NULL,
    employee_id       UUID         NOT NULL REFERENCES employees(id),
    employee_name     VARCHAR(50)  NOT NULL,
    employee_login_id VARCHAR(50)  NOT NULL,
    old_account_id    UUID         NOT NULL,
    target_account_id UUID         NOT NULL,
    match_reason      VARCHAR(200) NOT NULL,
    status            VARCHAR(20)  NOT NULL,
    applied_at        TIMESTAMP,

    -- BaseEntity 7 audit fields + soft delete
    created_at        TIMESTAMP    NOT NULL,
    created_by        VARCHAR(50)  NOT NULL,
    modified_at       TIMESTAMP,
    modified_by       VARCHAR(50),
    deleted_at        TIMESTAMP,
    deleted_by        VARCHAR(50),
    is_deleted        BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX ix_employee_account_link_plan
    ON employee_account_link_reconciliations (plan_key, status)
    WHERE is_deleted = FALSE;

CREATE INDEX ix_employee_account_link_employee
    ON employee_account_link_reconciliations (employee_id)
    WHERE is_deleted = FALSE;
