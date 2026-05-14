-- V7__add_arologis_auth_user.sql
-- 2026-05-14 — 아로로지스 독립 분리 (자체 auth + user 도메인 도입).
-- arologis-desktop 사용자 (AROLOGIS_MASTER / AROLOGIS_MANAGER). loginId 가 활성 행 unique.
-- BaseEntity 컬럼 컨벤션 = created_at / modified_at / deleted_at (V1 정확 미러링).
CREATE TABLE auth_admin_user (
    id              UUID            PRIMARY KEY,
    login_id        VARCHAR(64)     NOT NULL,
    password_hash   VARCHAR(200)    NOT NULL,
    name            VARCHAR(100)    NOT NULL,
    role            VARCHAR(32)     NOT NULL CHECK (role IN ('AROLOGIS_MASTER','AROLOGIS_MANAGER')),

    created_at      TIMESTAMP       NOT NULL,
    created_by      VARCHAR(50)     NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN         NOT NULL DEFAULT FALSE
);

-- loginId 활성 행 unique (Soft Delete 후 동일 loginId 재활성 허용).
CREATE UNIQUE INDEX ux_auth_admin_user_login_id_active
    ON auth_admin_user (login_id)
    WHERE is_deleted = FALSE;
