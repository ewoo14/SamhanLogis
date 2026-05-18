-- Phase 10 W10-2 — vehicle 테이블에 인성데이타 vendor 주문번호 + vendor 상태 컬럼 추가.
-- BaseEntity 7 audit + Soft Delete 는 vehicle 테이블에 이미 있음 (V1 migration).
-- 모든 신규 컬럼 NULL 허용 — legacy 호환 의무.

ALTER TABLE vehicles
    ADD COLUMN vendor_order_id VARCHAR(64),
    ADD COLUMN vendor_status VARCHAR(20);

COMMENT ON COLUMN vehicles.vendor_order_id IS '인성데이타 퀵프로그램 주문번호 (Phase 10 W10-2). NULL = 인성 미사용 또는 등록 전.';
COMMENT ON COLUMN vehicles.vendor_status IS '인성 vendor 상태 스냅샷 (Phase 10 W10-2). NULL = 상태 미수신.';

-- 활성 행 기준 vendor_order_id unique — race condition (match-result < status-update) 방지.
-- vendor_order_id NULL 행은 unique 제약 제외 (partial index).
CREATE UNIQUE INDEX uq_vehicle_vendor_order_id_active
    ON vehicles (vendor_order_id)
    WHERE is_deleted = false AND vendor_order_id IS NOT NULL;
