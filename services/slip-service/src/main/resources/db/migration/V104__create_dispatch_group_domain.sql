-- S1 provisional dispatch group domain.
-- 기존 dispatch_task/dispatch_vehicle_group 계열은 별도 aggregate이므로 변경하지 않는다.

CREATE TABLE carriers (
    id           UUID         PRIMARY KEY,
    code         VARCHAR(50)  NOT NULL,
    name         VARCHAR(100) NOT NULL,
    is_arologis  BOOLEAN      NOT NULL DEFAULT FALSE,
    partner_id   UUID,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,

    created_at   TIMESTAMP    NOT NULL,
    created_by   VARCHAR(50)  NOT NULL,
    modified_at  TIMESTAMP,
    modified_by  VARCHAR(50),
    deleted_at   TIMESTAMP,
    deleted_by   VARCHAR(50),
    is_deleted   BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX ux_carriers_code_active
    ON carriers (code) WHERE is_deleted = FALSE;
CREATE INDEX ix_carriers_active_name
    ON carriers (is_active, name) WHERE is_deleted = FALSE;

CREATE TABLE dispatch_groups (
    id               UUID        PRIMARY KEY,
    group_no         VARCHAR(50) NOT NULL,
    dispatch_date    DATE        NOT NULL,
    vehicle_label    VARCHAR(100) NOT NULL,
    carrier_id       UUID REFERENCES carriers (id) ON DELETE RESTRICT,
    transfer_status  VARCHAR(20) NOT NULL DEFAULT 'NOT_SENT'
        CHECK (transfer_status IN ('NOT_SENT', 'SENT', 'FAILED')),
    transferred_at   TIMESTAMP,

    created_at       TIMESTAMP    NOT NULL,
    created_by       VARCHAR(50)  NOT NULL,
    modified_at      TIMESTAMP,
    modified_by      VARCHAR(50),
    deleted_at       TIMESTAMP,
    deleted_by       VARCHAR(50),
    is_deleted       BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX ux_dispatch_groups_group_no_active
    ON dispatch_groups (group_no) WHERE is_deleted = FALSE;
CREATE INDEX ix_dispatch_groups_date_active
    ON dispatch_groups (dispatch_date, is_deleted);
CREATE INDEX ix_dispatch_groups_carrier_active
    ON dispatch_groups (carrier_id) WHERE is_deleted = FALSE;

CREATE TABLE dispatch_group_slips (
    id              UUID        PRIMARY KEY,
    group_id        UUID        NOT NULL REFERENCES dispatch_groups (id) ON DELETE RESTRICT,
    slip_id         UUID        NOT NULL REFERENCES slips (id) ON DELETE RESTRICT,
    inclusion_type  VARCHAR(20) NOT NULL CHECK (inclusion_type IN ('OUTBOUND', 'INBOUND')),
    sequence        INTEGER     NOT NULL CHECK (sequence > 0),

    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX ux_dispatch_group_slips_group_slip_active
    ON dispatch_group_slips (group_id, slip_id) WHERE is_deleted = FALSE;
-- 한 전표는 한 활성 그룹에만 편입된다.
CREATE UNIQUE INDEX ux_dispatch_group_slips_slip_active
    ON dispatch_group_slips (slip_id) WHERE is_deleted = FALSE;
CREATE UNIQUE INDEX ux_dispatch_group_slips_group_sequence_active
    ON dispatch_group_slips (group_id, sequence) WHERE is_deleted = FALSE;
CREATE INDEX ix_dispatch_group_slips_group_active
    ON dispatch_group_slips (group_id, sequence) WHERE is_deleted = FALSE;

COMMENT ON COLUMN carriers.partner_id IS
    '정산용 partner-service 식별자 참조값. 교차 서비스 FK를 만들지 않는다.';
COMMENT ON COLUMN dispatch_group_slips.slip_id IS
    '사용자 노출용 전표번호가 아닌 slips.id 구조적 참조. 응답에서는 slip_no로 변환한다.';

INSERT INTO carriers (id, code, name, is_arologis, partner_id, is_active,
                      created_at, created_by, is_deleted)
VALUES ('00000000-0000-0000-0000-000000000104', 'AROLOGIS', '아로로지스', TRUE, NULL, TRUE,
        CURRENT_TIMESTAMP, 'migration', FALSE)
ON CONFLICT DO NOTHING;
