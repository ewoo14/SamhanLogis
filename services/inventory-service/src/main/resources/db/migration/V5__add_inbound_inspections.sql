-- V5__add_inbound_inspections.sql
-- inventory-service — P0-9 입고 검수 UI Backend.
-- 입고 슬립(slip-service) 의 INBOUND 전표에 대한 검수 결과를 inventory-service 에서 관리.
-- 검수 완료(complete) 시 정상 수량(inspectedQty - defectQty) 을 stock_lots + stock_balances 에 반영.
--
-- 설계 결정:
--   * inbound_inspections 는 slipId 로 slip-service 를 logical reference (FK 미강제 — MSA 경계).
--   * inbound_inspection_lines 는 slipLineId 로 slip-service SlipLine 을 logical reference.
--   * 모든 컬럼 NULLable 또는 DEFAULT 적용 (legacy 호환, plan §migration 정책).
--   * status: PENDING(검수대기) / COMPLETED(검수완료) / CANCELED(검수취소).
--   * defect_qty / defect_reason 은 nullable — 불량 없는 경우 NULL.

----------------------------------------------------------------------
-- 1) inbound_inspections — 검수 헤더 (슬립 1건 = 검수 1건)
----------------------------------------------------------------------
CREATE TABLE inbound_inspections (
    id              UUID         PRIMARY KEY,

    -- slip-service 의 slip UUID (logical reference, FK 미강제)
    slip_id         UUID         NOT NULL,

    -- 슬립번호 snapshot (UUID 비공개 가드 — 사용자 식별자로 표면화)
    slip_no         VARCHAR(30),

    -- 검수 상태
    status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING',

    -- 검수 담당자 user-id (검수 시작 시 기입)
    inspector_id    VARCHAR(50),

    -- 검수 완료 일시
    completed_at    TIMESTAMP,

    -- 재고 반영 여부 (complete() 호출 성공 시 true)
    stock_applied   BOOLEAN      NOT NULL DEFAULT FALSE,

    -- BaseEntity audit columns
    created_at      TIMESTAMP    NOT NULL,
    created_by      VARCHAR(50)  NOT NULL,
    modified_at     TIMESTAMP,
    modified_by     VARCHAR(50),
    deleted_at      TIMESTAMP,
    deleted_by      VARCHAR(50),
    is_deleted      BOOLEAN      NOT NULL DEFAULT FALSE,

    version         BIGINT       NOT NULL DEFAULT 0
);

-- slip_id 단건 조회 (슬립 1건 = 검수 1건 정책. PENDING 중복 방지는 application level)
CREATE INDEX ix_inbound_inspections_slip
    ON inbound_inspections (slip_id)
    WHERE is_deleted = FALSE;

-- status 필터 페이지 조회 (PENDING / COMPLETED 조회 endpoint)
CREATE INDEX ix_inbound_inspections_status_created
    ON inbound_inspections (status, created_at DESC)
    WHERE is_deleted = FALSE;

COMMENT ON TABLE inbound_inspections IS
    'P0-9 입고 검수 헤더 — slip-service INBOUND 전표 1건당 1행. status: PENDING/COMPLETED/CANCELED';

COMMENT ON COLUMN inbound_inspections.slip_id IS
    'slip-service Slip UUID (logical reference, FK 미강제 — MSA 경계)';

COMMENT ON COLUMN inbound_inspections.slip_no IS
    'UUID 비공개 가드 — 사용자 노출용 슬립번호 snapshot (예: 2025/01/10-001)';

COMMENT ON COLUMN inbound_inspections.stock_applied IS
    'complete() 성공 시 TRUE — 중복 재고 반영 방지 idempotent 가드';

----------------------------------------------------------------------
-- 2) inbound_inspection_lines — 검수 라인 (슬립 라인 단위 검수 결과)
----------------------------------------------------------------------
CREATE TABLE inbound_inspection_lines (
    id                  UUID         PRIMARY KEY,

    -- 검수 헤더 FK
    inspection_id       UUID         NOT NULL REFERENCES inbound_inspections(id),

    -- slip-service 의 SlipLine UUID (logical reference, FK 미강제)
    slip_line_id        UUID         NOT NULL,

    -- 모델코드 snapshot (product-service 또는 slip-service 에서 추출)
    model_code          VARCHAR(100),

    -- 제품명 snapshot
    product_name        VARCHAR(200),

    -- 슬립 수량 (검수 기준 수량)
    expected_qty        INT          NOT NULL DEFAULT 0,

    -- 실제 검수 수량 (검수 후 입력)
    inspected_qty       INT,

    -- 불량 수량 (없으면 0 또는 NULL)
    defect_qty          INT,

    -- 불량 사유 (선택, 최대 500자)
    defect_reason       VARCHAR(500),

    -- BaseEntity audit columns
    created_at          TIMESTAMP    NOT NULL,
    created_by          VARCHAR(50)  NOT NULL,
    modified_at         TIMESTAMP,
    modified_by         VARCHAR(50),
    deleted_at          TIMESTAMP,
    deleted_by          VARCHAR(50),
    is_deleted          BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX ix_inbound_inspection_lines_inspection
    ON inbound_inspection_lines (inspection_id, is_deleted);

COMMENT ON TABLE inbound_inspection_lines IS
    'P0-9 입고 검수 라인 — inbound_inspections 1행 당 N행 (슬립 라인 단위 검수 결과)';

COMMENT ON COLUMN inbound_inspection_lines.expected_qty IS
    '슬립 라인의 quantity (검수 기준 수량)';

COMMENT ON COLUMN inbound_inspection_lines.inspected_qty IS
    '실제 검수 수량 (NULL = 아직 검수 미입력). 검수 완료 후 NOT NULL 보장은 application level';

COMMENT ON COLUMN inbound_inspection_lines.defect_qty IS
    '불량 수량 (NULL = 불량 없음). 정상 수량 = inspected_qty - defect_qty';
