-- V31__create_serial_compensation_failures.sql
-- 시리얼/배치 원격 보상 실패 감사 테이블.
--
-- inventory-service 원격 보상 호출이 실패한 경우 slip-service DB 에 append-only 로
-- 남겨 운영자가 고아 RESERVED/RECALLED 재고를 수동 정합할 수 있게 한다.

CREATE TABLE serial_compensation_failures (
    id                       UUID          PRIMARY KEY,
    slip_id                  UUID          NOT NULL,
    slip_no                  VARCHAR(64)   NOT NULL,  -- slips.slip_no 역정규화 사본(원본 VARCHAR(30), 여유 폭)
    slip_type                VARCHAR(32)   NOT NULL,
    phase                    VARCHAR(32)   NOT NULL,
    product_code             VARCHAR(64)   NOT NULL,
    attempted_operation      VARCHAR(32)   NOT NULL,
    failure_reason           VARCHAR(1000) NOT NULL,
    original_failure_reason  VARCHAR(1000) NOT NULL,
    resolved                 BOOLEAN       NOT NULL DEFAULT FALSE,
    occurred_at              TIMESTAMP     NOT NULL,

    -- BaseEntity audit
    created_at               TIMESTAMP     NOT NULL,
    created_by               VARCHAR(50)   NOT NULL,
    modified_at              TIMESTAMP,
    modified_by              VARCHAR(50),
    deleted_at               TIMESTAMP,
    deleted_by               VARCHAR(50),
    is_deleted               BOOLEAN       NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_serial_comp_failures_resolved_created
    ON serial_compensation_failures (resolved, created_at);

-- 운영자 전표번호 조회 / cleanup(slip_no LIKE) Sequential Scan 방지.
CREATE INDEX idx_serial_comp_failures_slip_no
    ON serial_compensation_failures (slip_no);
