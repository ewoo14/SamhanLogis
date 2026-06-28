-- V5__app_notice.sql
-- DEV-2 팝업공지: 기간 기반 활성 공지 + MinIO 이미지 메타.
-- BaseEntity 7 audit + soft-delete. 실제 객체는 MinIO/S3에 보관하고 DB에는 object key만 저장한다.

CREATE TABLE app_notice (
    id             UUID      PRIMARY KEY,
    title          TEXT      NOT NULL,
    is_active      BOOLEAN   NOT NULL DEFAULT TRUE,
    start_at       TIMESTAMP NOT NULL,
    end_at         TIMESTAMP NOT NULL,
    display_order  INT       NOT NULL DEFAULT 0,

    created_at     TIMESTAMP   NOT NULL,
    created_by     VARCHAR(50) NOT NULL,
    modified_at    TIMESTAMP,
    modified_by    VARCHAR(50),
    deleted_at     TIMESTAMP,
    deleted_by     VARCHAR(50),
    is_deleted     BOOLEAN     NOT NULL DEFAULT FALSE,

    CONSTRAINT ck_app_notice_period CHECK (start_at <= end_at),
    CONSTRAINT ck_app_notice_display_order_non_negative CHECK (display_order >= 0)
);

CREATE INDEX ix_app_notice_active_period
    ON app_notice (is_active, start_at, end_at, display_order)
    WHERE is_deleted = FALSE;

CREATE TABLE app_notice_image (
    id             UUID         PRIMARY KEY,
    notice_id      UUID         NOT NULL,
    image_key      VARCHAR(500) NOT NULL,
    original_file_name VARCHAR(255) NOT NULL,
    display_order  INT          NOT NULL DEFAULT 0,
    caption        TEXT,

    created_at     TIMESTAMP   NOT NULL,
    created_by     VARCHAR(50) NOT NULL,
    modified_at    TIMESTAMP,
    modified_by    VARCHAR(50),
    deleted_at     TIMESTAMP,
    deleted_by     VARCHAR(50),
    is_deleted     BOOLEAN     NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_app_notice_image_notice
        FOREIGN KEY (notice_id) REFERENCES app_notice (id),
    CONSTRAINT ck_app_notice_image_display_order_non_negative CHECK (display_order >= 0)
);

CREATE INDEX ix_app_notice_image_notice_order
    ON app_notice_image (notice_id, display_order)
    WHERE is_deleted = FALSE;
