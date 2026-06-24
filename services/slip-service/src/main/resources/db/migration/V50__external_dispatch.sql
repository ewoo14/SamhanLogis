-- V50__external_dispatch.sql
-- 타배송사 발송 이력. 슬3는 SMS 단방향 발송만 사용하고 PRINT/BOTH 는 슬4에서 연결한다.

CREATE TABLE IF NOT EXISTS external_dispatch (
    id              UUID        PRIMARY KEY,
    carrier_id      UUID        NOT NULL REFERENCES external_carrier (id),
    channel         VARCHAR(10) NOT NULL CHECK (channel IN ('SMS', 'PRINT', 'BOTH')),
    dispatch_date   DATE        NOT NULL,
    sent_at         TIMESTAMP,
    sent_by         UUID,
    status          VARCHAR(10) NOT NULL CHECK (status IN ('SENT', 'FAILED')),

    -- BaseEntity 7 audit
    created_at      TIMESTAMP   NOT NULL,
    created_by      VARCHAR(50) NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE external_dispatch IS
    '타배송사 발송 이력 — 사용자 화면 식별자는 배송사명/전화번호/전표번호이며 UUID 는 내부 라우팅용';

COMMENT ON COLUMN external_dispatch.id IS
    '내부 라우팅용 UUID. 사용자 화면에 식별자로 노출하지 않는다';

CREATE INDEX IF NOT EXISTS ix_external_dispatch_carrier_id
    ON external_dispatch (carrier_id);

CREATE TABLE IF NOT EXISTS external_dispatch_slip (
    id                   UUID        PRIMARY KEY,
    external_dispatch_id UUID        NOT NULL REFERENCES external_dispatch (id),
    slip_id              UUID        NOT NULL REFERENCES slips (id),
    sequence             INT         NOT NULL,

    -- BaseEntity 7 audit
    created_at           TIMESTAMP   NOT NULL,
    created_by           VARCHAR(50) NOT NULL,
    modified_at          TIMESTAMP,
    modified_by          VARCHAR(50),
    deleted_at           TIMESTAMP,
    deleted_by           VARCHAR(50),
    is_deleted           BOOLEAN     NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE external_dispatch_slip IS
    '타배송사 발송 이력별 전표 매핑 — slip UUID 는 내부 참조용이며 화면에는 slipNo 만 노출';

CREATE INDEX IF NOT EXISTS ix_external_dispatch_slip_dispatch_id
    ON external_dispatch_slip (external_dispatch_id);

CREATE INDEX IF NOT EXISTS ix_external_dispatch_slip_slip_id
    ON external_dispatch_slip (slip_id);
