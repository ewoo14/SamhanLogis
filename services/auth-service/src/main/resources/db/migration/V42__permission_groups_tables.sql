-- V42__permission_groups_tables.sql
-- 동적 권한그룹 Phase A: permission group / group permission / account assignment / account override.
--
-- audit 컬럼은 V39 account_page_permissions 와 동일하게 BaseEntity 7필드
-- (created_at/created_by/modified_at/modified_by/deleted_at/deleted_by/is_deleted)를 사용한다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS permission_groups (
    id                  UUID         NOT NULL DEFAULT gen_random_uuid(),
    name                VARCHAR(100) NOT NULL,
    description         VARCHAR(255),
    is_builtin          BOOLEAN      NOT NULL DEFAULT FALSE,
    is_system_master    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(50)  NOT NULL DEFAULT 'system',
    modified_at         TIMESTAMP,
    modified_by         VARCHAR(50),
    deleted_at          TIMESTAMP,
    deleted_by          VARCHAR(50),
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT permission_groups_pk PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_permission_groups_name_active
    ON permission_groups (name)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_permission_groups_system_master
    ON permission_groups (is_system_master)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_permission_groups_builtin
    ON permission_groups (is_builtin)
    WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS group_page_permissions (
    id              UUID         NOT NULL DEFAULT gen_random_uuid(),
    group_id        UUID         NOT NULL,
    page_code       VARCHAR(100) NOT NULL,
    can_view        BOOLEAN      NOT NULL DEFAULT FALSE,
    can_create      BOOLEAN      NOT NULL DEFAULT FALSE,
    can_update      BOOLEAN      NOT NULL DEFAULT FALSE,
    can_delete      BOOLEAN      NOT NULL DEFAULT FALSE,
    can_restore     BOOLEAN      NOT NULL DEFAULT FALSE,
    can_download    BOOLEAN      NOT NULL DEFAULT FALSE,
    can_print       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(50)  NOT NULL DEFAULT 'system',
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT group_page_permissions_pk PRIMARY KEY (id),
    CONSTRAINT group_page_permissions_group_fk
        FOREIGN KEY (group_id) REFERENCES permission_groups (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_group_page_permissions_active
    ON group_page_permissions (group_id, page_code)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_group_page_permissions_group
    ON group_page_permissions (group_id)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_group_page_permissions_page
    ON group_page_permissions (page_code)
    WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS account_groups (
    id              UUID         NOT NULL DEFAULT gen_random_uuid(),
    account_id      UUID         NOT NULL,
    group_id        UUID         NOT NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(50)  NOT NULL DEFAULT 'system',
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT account_groups_pk PRIMARY KEY (id),
    CONSTRAINT account_groups_account_fk
        FOREIGN KEY (account_id) REFERENCES accounts (id),
    CONSTRAINT account_groups_group_fk
        FOREIGN KEY (group_id) REFERENCES permission_groups (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_account_groups_active
    ON account_groups (account_id, group_id)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_account_groups_account
    ON account_groups (account_id)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_account_groups_group
    ON account_groups (group_id)
    WHERE is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS account_permission_overrides (
    id              UUID         NOT NULL DEFAULT gen_random_uuid(),
    account_id      UUID         NOT NULL,
    page_code       VARCHAR(100) NOT NULL,
    can_view        BOOLEAN      NOT NULL DEFAULT FALSE,
    can_create      BOOLEAN      NOT NULL DEFAULT FALSE,
    can_update      BOOLEAN      NOT NULL DEFAULT FALSE,
    can_delete      BOOLEAN      NOT NULL DEFAULT FALSE,
    can_restore     BOOLEAN      NOT NULL DEFAULT FALSE,
    can_download    BOOLEAN      NOT NULL DEFAULT FALSE,
    can_print       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by      VARCHAR(50)  NOT NULL DEFAULT 'system',
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
    CONSTRAINT account_permission_overrides_pk PRIMARY KEY (id),
    CONSTRAINT account_permission_overrides_account_fk
        FOREIGN KEY (account_id) REFERENCES accounts (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_account_permission_overrides_active
    ON account_permission_overrides (account_id, page_code)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_account_permission_overrides_account
    ON account_permission_overrides (account_id)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS ix_account_permission_overrides_page
    ON account_permission_overrides (page_code)
    WHERE is_deleted = FALSE;
