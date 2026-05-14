-- V8__add_arologis_refresh_token.sql
-- 2026-05-14 — 아로로지스 독립 분리 (RefreshToken rotation 지원).
-- ADMIN / DRIVER polymorphic — userId 출처 구분은 user_type 으로.
-- BaseEntity 컬럼 컨벤션 = created_at / modified_at / deleted_at (V1 정확 미러링).
CREATE TABLE auth_refresh_token (
    id              UUID            PRIMARY KEY,
    user_id         UUID            NOT NULL,
    user_type       VARCHAR(16)     NOT NULL CHECK (user_type IN ('ADMIN','DRIVER')),
    token_hash      VARCHAR(200)    NOT NULL,
    expires_at      TIMESTAMP       NOT NULL,
    revoked         BOOLEAN         NOT NULL DEFAULT FALSE,

    created_at      TIMESTAMP       NOT NULL,
    created_by      VARCHAR(50)     NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN         NOT NULL DEFAULT FALSE
);

-- user 별 활성 토큰 lookup (만료 정리 등).
CREATE INDEX ix_auth_refresh_token_user
    ON auth_refresh_token (user_id, expires_at)
    WHERE is_deleted = FALSE;

-- tokenHash 활성 행 unique (Soft Delete 후 재발급 허용).
CREATE UNIQUE INDEX ux_auth_refresh_token_hash_active
    ON auth_refresh_token (token_hash)
    WHERE is_deleted = FALSE;
