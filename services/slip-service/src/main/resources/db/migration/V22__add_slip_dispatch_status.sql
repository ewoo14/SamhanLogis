-- V22__add_slip_dispatch_status.sql
-- Samhan Public 배차 메뉴 Phase A — slips.dispatch_status 컬럼 추가 (BE Task B3, D-DB-04).
--
-- 배차 메뉴 미배차 목록 source = dispatch_status='UNDISPATCHED' 필터링.
-- 상태 전이:
--   UNDISPATCHED → DISPATCHING (배차 완료 trigger)
--   DISPATCHING  → DISPATCHED  (arologis confirm 회신)
--   DISPATCHING  → UNDISPATCHED (arologis unavailable 회신, 재배차 대기)

ALTER TABLE slips
    ADD COLUMN dispatch_status VARCHAR(32) NOT NULL DEFAULT 'UNDISPATCHED'
        CHECK (dispatch_status IN ('UNDISPATCHED','DISPATCHING','DISPATCHED'));

CREATE INDEX ix_slips_dispatch_status_active
    ON slips(dispatch_status) WHERE is_deleted = FALSE;
