-- V6__create_push_device_tokens.sql
-- N3a 네이티브 FCM 푸시 연동 — 사용자 디바이스 토큰 저장소.

CREATE TABLE push_device_tokens (
    id             UUID         PRIMARY KEY,
    user_id        UUID         NOT NULL,
    token          VARCHAR(512) NOT NULL,
    platform       VARCHAR(20)  NOT NULL,
    app_client     VARCHAR(50)  NOT NULL,
    last_seen_at   TIMESTAMP    NOT NULL,

    created_at     TIMESTAMP    NOT NULL,
    created_by     VARCHAR(50)  NOT NULL,
    modified_at    TIMESTAMP,
    modified_by    VARCHAR(50),
    deleted_at     TIMESTAMP,
    deleted_by     VARCHAR(50),
    is_deleted     BOOLEAN      NOT NULL DEFAULT FALSE,

    CONSTRAINT chk_push_device_tokens_platform
        CHECK (platform IN ('ANDROID', 'IOS', 'WEB'))
);

CREATE UNIQUE INDEX ux_push_device_tokens_token_active
    ON push_device_tokens(token)
    WHERE is_deleted = FALSE;

CREATE INDEX ix_push_device_tokens_user_active
    ON push_device_tokens(user_id, last_seen_at DESC)
    WHERE is_deleted = FALSE;
