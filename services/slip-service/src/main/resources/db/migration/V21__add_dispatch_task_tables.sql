-- V21__add_dispatch_task_tables.sql
-- Samhan Public 배차 메뉴 Phase A — 4 신규 테이블 (BE Task B2 + B10):
--   1) dispatch_task           — 배차 작업 헤더 (DRAFT/DISPATCHING/DISPATCHED/FAILED)
--   2) dispatch_vehicle_group  — 배차 작업 내 차량 그룹 (sequence + vehicle_type)
--   3) dispatch_vehicle_group_slip — 차량 그룹 ↔ slip 매핑 (정차 sequence)
--   4) dispatch_matched_driver — arologis 회신 시 매칭된 기사 (vehicle_group ↔ driver)
--
-- 컬럼 컨벤션: V1__init_slip_service.sql 과 동일 (TIMESTAMP, modified_at/by, is_deleted).
-- Soft-delete = application-side @SQLRestriction("is_deleted = false") + partial unique.

----------------------------------------------------------------------
-- 1) dispatch_task — 배차 작업 헤더
----------------------------------------------------------------------
CREATE TABLE dispatch_task (
    id                    UUID         PRIMARY KEY,
    task_code             VARCHAR(32)  NOT NULL,
    dispatch_date         DATE         NOT NULL,
    status                VARCHAR(32)  NOT NULL
                          CHECK (status IN ('DRAFT','DISPATCHING','DISPATCHED','FAILED')),
    arologis_dispatch_id  UUID,
    failure_reason        VARCHAR(500),

    -- BaseEntity audit
    created_at            TIMESTAMP    NOT NULL,
    created_by            VARCHAR(50)  NOT NULL,
    modified_at           TIMESTAMP,
    modified_by           VARCHAR(50),
    deleted_at            TIMESTAMP,
    deleted_by            VARCHAR(50),
    is_deleted            BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX uq_dispatch_task_code_active
    ON dispatch_task(task_code) WHERE is_deleted = FALSE;
CREATE INDEX ix_dispatch_task_date_status_active
    ON dispatch_task(dispatch_date, status) WHERE is_deleted = FALSE;

----------------------------------------------------------------------
-- 2) dispatch_vehicle_group — 배차 작업 내 차량 그룹
----------------------------------------------------------------------
CREATE TABLE dispatch_vehicle_group (
    id                 UUID         PRIMARY KEY,
    dispatch_task_id   UUID         NOT NULL REFERENCES dispatch_task(id),
    sequence           INTEGER      NOT NULL,
    vehicle_type       VARCHAR(32)  NOT NULL
                       CHECK (vehicle_type IN (
                           'MOTORCYCLE','DAMAS','TONNAGE_1','TONNAGE_1_5','TONNAGE_2_5',
                           'TONNAGE_3','TONNAGE_5','TONNAGE_10','TONNAGE_20')),

    created_at         TIMESTAMP    NOT NULL,
    created_by         VARCHAR(50)  NOT NULL,
    modified_at        TIMESTAMP,
    modified_by        VARCHAR(50),
    deleted_at         TIMESTAMP,
    deleted_by         VARCHAR(50),
    is_deleted         BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX uq_vehicle_group_task_seq_active
    ON dispatch_vehicle_group(dispatch_task_id, sequence) WHERE is_deleted = FALSE;
CREATE INDEX ix_vehicle_group_task_active
    ON dispatch_vehicle_group(dispatch_task_id) WHERE is_deleted = FALSE;

----------------------------------------------------------------------
-- 3) dispatch_vehicle_group_slip — 차량 그룹 ↔ slip 매핑 (정차 순서)
----------------------------------------------------------------------
CREATE TABLE dispatch_vehicle_group_slip (
    id                    UUID         PRIMARY KEY,
    vehicle_group_id      UUID         NOT NULL REFERENCES dispatch_vehicle_group(id),
    slip_id               UUID         NOT NULL,
    sequence              INTEGER      NOT NULL,

    created_at            TIMESTAMP    NOT NULL,
    created_by            VARCHAR(50)  NOT NULL,
    modified_at           TIMESTAMP,
    modified_by           VARCHAR(50),
    deleted_at            TIMESTAMP,
    deleted_by            VARCHAR(50),
    is_deleted            BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX uq_vehicle_group_slip_active
    ON dispatch_vehicle_group_slip(vehicle_group_id, slip_id) WHERE is_deleted = FALSE;
CREATE INDEX ix_vehicle_group_slip_slip_active
    ON dispatch_vehicle_group_slip(slip_id) WHERE is_deleted = FALSE;
CREATE INDEX ix_vehicle_group_slip_group_active
    ON dispatch_vehicle_group_slip(vehicle_group_id) WHERE is_deleted = FALSE;

----------------------------------------------------------------------
-- 4) dispatch_matched_driver — arologis 회신 시 매칭된 기사
----------------------------------------------------------------------
CREATE TABLE dispatch_matched_driver (
    id                    UUID         PRIMARY KEY,
    vehicle_group_id      UUID         NOT NULL REFERENCES dispatch_vehicle_group(id),
    driver_code           VARCHAR(32)  NOT NULL,
    driver_name           VARCHAR(100) NOT NULL,
    driver_phone_number   VARCHAR(20)  NOT NULL,
    driver_source         VARCHAR(32)  NOT NULL,

    created_at            TIMESTAMP    NOT NULL,
    created_by            VARCHAR(50)  NOT NULL,
    modified_at           TIMESTAMP,
    modified_by           VARCHAR(50),
    deleted_at            TIMESTAMP,
    deleted_by            VARCHAR(50),
    is_deleted            BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX uq_matched_driver_group_active
    ON dispatch_matched_driver(vehicle_group_id) WHERE is_deleted = FALSE;
CREATE INDEX ix_matched_driver_code_active
    ON dispatch_matched_driver(driver_code) WHERE is_deleted = FALSE;
