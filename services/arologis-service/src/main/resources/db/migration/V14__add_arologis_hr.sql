-- V14__add_arologis_hr.sql
-- 2026-06-08 — arologis-desktop 백오피스 Phase B: 행정직원 HR.
--
-- 설계:
--   - 직원 생성 시 auth_admin_user 1:1 provisioning.
--   - 퇴직은 termination_date 설정 + 직원/AdminUser soft-delete.
--   - 화면/API 응답 식별자는 login_id / department code 이며 UUID 는 내부 FK 로만 사용.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE arologis_department (
    id              UUID            PRIMARY KEY,
    code            VARCHAR(64)     NOT NULL,
    name            VARCHAR(100)    NOT NULL,
    display_order   INT             NOT NULL DEFAULT 0,

    created_at      TIMESTAMP       NOT NULL,
    created_by      VARCHAR(50)     NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN         NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX ux_arologis_department_code_active
    ON arologis_department (code)
    WHERE is_deleted = FALSE;

CREATE INDEX ix_arologis_department_order_active
    ON arologis_department (display_order, code)
    WHERE is_deleted = FALSE;

CREATE TABLE arologis_employee (
    id                UUID          PRIMARY KEY,
    admin_user_id     UUID          NOT NULL REFERENCES auth_admin_user(id),
    login_id          VARCHAR(64)   NOT NULL,
    full_name         VARCHAR(100)  NOT NULL,
    position          VARCHAR(30),
    department_id     UUID          NOT NULL REFERENCES arologis_department(id),
    hire_date         DATE          NOT NULL,
    termination_date  DATE,
    email             VARCHAR(100),
    phone             VARCHAR(20),

    created_at        TIMESTAMP     NOT NULL,
    created_by        VARCHAR(50)   NOT NULL,
    modified_at       TIMESTAMP,
    modified_by       VARCHAR(50),
    deleted_at        TIMESTAMP,
    deleted_by        VARCHAR(50),
    is_deleted        BOOLEAN       NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX ux_arologis_employee_login_id_active
    ON arologis_employee (login_id)
    WHERE is_deleted = FALSE;

CREATE UNIQUE INDEX ux_arologis_employee_admin_user_active
    ON arologis_employee (admin_user_id)
    WHERE is_deleted = FALSE;

CREATE INDEX ix_arologis_employee_department_active
    ON arologis_employee (department_id, login_id)
    WHERE is_deleted = FALSE;

CREATE INDEX ix_arologis_employee_current_active
    ON arologis_employee (department_id, hire_date)
    WHERE is_deleted = FALSE AND termination_date IS NULL;

CREATE TABLE arologis_role_change_history (
    id              UUID            PRIMARY KEY,
    employee_id     UUID            NOT NULL REFERENCES arologis_employee(id),
    previous_role   VARCHAR(32)     CHECK (previous_role IS NULL OR previous_role IN ('AROLOGIS_MASTER','AROLOGIS_MANAGER')),
    new_role        VARCHAR(32)     NOT NULL CHECK (new_role IN ('AROLOGIS_MASTER','AROLOGIS_MANAGER')),
    reason          VARCHAR(500),

    created_at      TIMESTAMP       NOT NULL,
    created_by      VARCHAR(50)     NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN         NOT NULL DEFAULT FALSE
);

CREATE INDEX ix_arologis_role_history_employee_created
    ON arologis_role_change_history (employee_id, created_at DESC)
    WHERE is_deleted = FALSE;

INSERT INTO arologis_department (
    id, code, name, display_order,
    created_at, created_by, modified_at, modified_by, is_deleted
)
VALUES
    (gen_random_uuid(), 'ADMIN',      '행정', 10, NOW(), 'v14-arologis-hr', NOW(), 'v14-arologis-hr', FALSE),
    (gen_random_uuid(), 'DISPATCH',   '배차', 20, NOW(), 'v14-arologis-hr', NOW(), 'v14-arologis-hr', FALSE),
    (gen_random_uuid(), 'ACCOUNTING', '회계', 30, NOW(), 'v14-arologis-hr', NOW(), 'v14-arologis-hr', FALSE),
    (gen_random_uuid(), 'OPERATIONS', '운영', 40, NOW(), 'v14-arologis-hr', NOW(), 'v14-arologis-hr', FALSE)
ON CONFLICT (code) WHERE is_deleted = FALSE DO UPDATE
SET name = EXCLUDED.name,
    display_order = EXCLUDED.display_order,
    modified_at = NOW(),
    modified_by = 'v14-arologis-hr';
