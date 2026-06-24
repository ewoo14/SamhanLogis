-- V49__external_carrier.sql
-- 외부기사/배송사 마스터. 슬3 external_dispatch 계열 테이블은 본 migration 에서 생성하지 않는다.

CREATE TABLE IF NOT EXISTS external_carrier (
    id                   UUID         PRIMARY KEY,
    name                 VARCHAR(100) NOT NULL,
    phone                VARCHAR(30)  NOT NULL,
    email                VARCHAR(255),
    default_vehicle_type VARCHAR(50),
    memo                 TEXT,
    active               BOOLEAN      NOT NULL DEFAULT TRUE,

    -- BaseEntity 7 audit
    created_at           TIMESTAMP    NOT NULL,
    created_by           VARCHAR(50)  NOT NULL,
    modified_at          TIMESTAMP,
    modified_by          VARCHAR(50),
    deleted_at           TIMESTAMP,
    deleted_by           VARCHAR(50),
    is_deleted           BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE external_carrier IS
    '외부기사/배송사 마스터 — 타배송사 SMS/인쇄 발송 대상. 사용자 노출 식별자는 name/phone';

COMMENT ON COLUMN external_carrier.id IS
    '내부 라우팅용 UUID. 사용자 화면에 식별자로 노출하지 않는다';

CREATE UNIQUE INDEX IF NOT EXISTS ux_external_carrier_phone_active
    ON external_carrier (phone)
    WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS ix_external_carrier_name
    ON external_carrier (name);
