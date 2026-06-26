-- V3__app_release.sql
-- 버전관리 + 자동업데이트 V1a — 앱 릴리스 정책 테이블.
-- BaseEntity 7 audit + soft-delete, enum CHECK, 활성 행 partial unique.

CREATE TABLE app_release (
    id                    UUID         PRIMARY KEY,
    client_type           VARCHAR(20)  NOT NULL,
    version               VARCHAR(50)  NOT NULL,
    force_level           VARCHAR(20)  NOT NULL,
    release_notes         TEXT         NOT NULL,
    released_at           TIMESTAMP    NOT NULL,
    min_supported_version VARCHAR(50)  NOT NULL,

    created_at            TIMESTAMP    NOT NULL,
    created_by            VARCHAR(50)  NOT NULL,
    modified_at           TIMESTAMP,
    modified_by           VARCHAR(50),
    deleted_at            TIMESTAMP,
    deleted_by            VARCHAR(50),
    is_deleted            BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT ck_app_release_client_type
        CHECK (client_type IN ('DESKTOP', 'WEB', 'MOBILE')),
    CONSTRAINT ck_app_release_force_level
        CHECK (force_level IN ('CRITICAL', 'MAJOR', 'MINOR'))
);

CREATE UNIQUE INDEX ux_app_release_client_type_version_active
    ON app_release (client_type, version)
    WHERE is_deleted = FALSE;

CREATE INDEX ix_app_release_client_type_active
    ON app_release (client_type)
    WHERE is_deleted = FALSE;
