-- V8__add_ecount_mig6_employee_asset.sql
-- MIG-6 이카운트 사원/인사카드/급여관리사원 raw staging + domain tables.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS staging;

ALTER TABLE employees ADD COLUMN IF NOT EXISTS ecount_code VARCHAR(50);
ALTER TABLE employees ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE staging.ecount_department_map ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS ux_employees_ecount_code_active
    ON employees (ecount_code)
    WHERE ecount_code IS NOT NULL AND is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS employee_cards (
    id                      UUID         NOT NULL DEFAULT gen_random_uuid(),
    employee_id             UUID         NOT NULL REFERENCES employees(id),
    employee_code           VARCHAR(50)  NOT NULL,
    employee_name           VARCHAR(100) NOT NULL,
    resident_number_masked  VARCHAR(14)  NOT NULL,
    department_id           UUID         REFERENCES departments(id),
    department_name         VARCHAR(100),
    position_name           VARCHAR(50),
    hire_date               DATE,
    account_number          VARCHAR(100),
    email                   VARCHAR(100),
    created_at              TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by              VARCHAR(50)  NOT NULL DEFAULT 'system',
    modified_at             TIMESTAMP,
    modified_by             VARCHAR(50),
    deleted_at              TIMESTAMP,
    deleted_by              VARCHAR(50),
    is_deleted              BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT employee_cards_pk PRIMARY KEY (id)
);

ALTER TABLE employee_cards ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_employee_cards_employee_active
    ON employee_cards (employee_id)
    WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS payroll_employees (
    id                  UUID         NOT NULL DEFAULT gen_random_uuid(),
    employee_id         UUID         NOT NULL REFERENCES employees(id),
    employee_code       VARCHAR(50)  NOT NULL,
    employee_name       VARCHAR(100) NOT NULL,
    payment_type        VARCHAR(50),
    department_id       UUID,
    department_name     VARCHAR(100),
    salary_type         VARCHAR(50),
    hire_date           DATE,
    leave_date          DATE,
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(50)  NOT NULL DEFAULT 'system',
    modified_at         TIMESTAMP,
    modified_by         VARCHAR(50),
    deleted_at          TIMESTAMP,
    deleted_by          VARCHAR(50),
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT payroll_employees_pk PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_payroll_employees_employee_active
    ON payroll_employees (employee_id)
    WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS staging.ecount_employee_raw (
    source_file_hash        VARCHAR(64) NOT NULL,
    source_row_no           INT         NOT NULL,
    employee_code           TEXT,
    employee_name           TEXT,
    search_content          TEXT,
    phone                   TEXT,
    email                   TEXT,
    usage_flag_raw          TEXT,
    raw_payload             TEXT,
    transform_status        VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    target_employee_id      UUID,
    reject_reason           TEXT,
    created_at              TIMESTAMP   NOT NULL DEFAULT NOW(),
    created_by              VARCHAR(50) NOT NULL,
    modified_at             TIMESTAMP   NOT NULL DEFAULT NOW(),
    modified_by             VARCHAR(50) NOT NULL,
    deleted_at              TIMESTAMP,
    deleted_by              VARCHAR(50),
    is_deleted              BOOLEAN     NOT NULL DEFAULT FALSE,
    PRIMARY KEY (source_file_hash, source_row_no)
);

CREATE TABLE IF NOT EXISTS staging.ecount_employee_card_raw (
    source_file_hash        VARCHAR(64) NOT NULL,
    source_row_no           INT         NOT NULL,
    employee_code           TEXT,
    employee_name           TEXT,
    resident_number_masked  VARCHAR(14),
    department_id           UUID,
    department_name         TEXT,
    position_name           TEXT,
    hire_date               DATE,
    account_number          TEXT,
    email                   TEXT,
    raw_payload             TEXT,
    transform_status        VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    target_employee_card_id UUID,
    reject_reason           TEXT,
    created_at              TIMESTAMP   NOT NULL DEFAULT NOW(),
    created_by              VARCHAR(50) NOT NULL,
    modified_at             TIMESTAMP   NOT NULL DEFAULT NOW(),
    modified_by             VARCHAR(50) NOT NULL,
    deleted_at              TIMESTAMP,
    deleted_by              VARCHAR(50),
    is_deleted              BOOLEAN     NOT NULL DEFAULT FALSE,
    PRIMARY KEY (source_file_hash, source_row_no)
);

ALTER TABLE staging.ecount_employee_card_raw ADD COLUMN IF NOT EXISTS department_id UUID;

CREATE TABLE IF NOT EXISTS staging.ecount_payroll_employee_raw (
    source_file_hash            VARCHAR(64) NOT NULL,
    source_row_no               INT         NOT NULL,
    employee_code               TEXT,
    employee_name               TEXT,
    payment_type                TEXT,
    department_name             TEXT,
    salary_type                 TEXT,
    hire_date                   DATE,
    leave_date                  DATE,
    raw_payload                 TEXT,
    transform_status            VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    target_payroll_employee_id  UUID,
    reject_reason               TEXT,
    created_at                  TIMESTAMP   NOT NULL DEFAULT NOW(),
    created_by                  VARCHAR(50) NOT NULL,
    modified_at                 TIMESTAMP   NOT NULL DEFAULT NOW(),
    modified_by                 VARCHAR(50) NOT NULL,
    deleted_at                  TIMESTAMP,
    deleted_by                  VARCHAR(50),
    is_deleted                  BOOLEAN     NOT NULL DEFAULT FALSE,
    PRIMARY KEY (source_file_hash, source_row_no)
);
