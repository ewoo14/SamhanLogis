-- QR 스캔 성공 감사 이벤트. movement.note와 분리하고 BaseEntity 7 audit + soft delete를 사용한다.
CREATE TABLE stock_scan_events (
    id           UUID         PRIMARY KEY,
    slip_id      UUID         NOT NULL,
    slip_no      VARCHAR(64)  NOT NULL,
    serial_key   VARCHAR(9)   NOT NULL,
    product_code VARCHAR(50)  NOT NULL,
    direction    VARCHAR(20)  NOT NULL,

    created_at   TIMESTAMP    NOT NULL,
    created_by   VARCHAR(50)  NOT NULL,
    modified_at  TIMESTAMP,
    modified_by  VARCHAR(50),
    deleted_at   TIMESTAMP,
    deleted_by   VARCHAR(50),
    is_deleted   BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX ix_stock_scan_events_slip
    ON stock_scan_events (slip_id, created_at DESC);

CREATE INDEX ix_stock_scan_events_serial
    ON stock_scan_events (serial_key, created_at DESC);
