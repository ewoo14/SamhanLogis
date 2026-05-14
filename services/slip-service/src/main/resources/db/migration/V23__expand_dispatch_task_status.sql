-- V23__expand_dispatch_task_status.sql
-- Samhan Public 배차 수정/취소 흐름 Phase C — DispatchTaskStatus 6 신규 값 + 4 column 추가 (BE Task B1).
--
-- 1) status CHECK constraint 갱신: 4 값 → 11 값 (Phase A 4 + Phase C 신규 7)
-- 2) modification/cancellation 메타데이터 4 column 추가
--    - modification_reason         : 요청 시 배차담당자가 입력한 사유 (NULL 허용)
--    - rejection_reason            : 아로로지스 거부 시 사유 (NULL 허용)
--    - modification_requested_at   : 요청 발송 시점
--    - modification_decided_at     : 수락/거부 결정 시점

ALTER TABLE dispatch_task DROP CONSTRAINT IF EXISTS dispatch_task_status_check;
ALTER TABLE dispatch_task ADD CONSTRAINT dispatch_task_status_check
    CHECK (status IN (
        'DRAFT','DISPATCHING','DISPATCHED','FAILED',
        'MODIFICATION_REQUESTED','MODIFICATION_ACCEPTED','MODIFICATION_REJECTED',
        'CANCEL_REQUESTED','CANCEL_ACCEPTED','CANCEL_REJECTED','CANCELLED'
    ));

ALTER TABLE dispatch_task
    ADD COLUMN modification_reason       VARCHAR(500),
    ADD COLUMN rejection_reason          VARCHAR(500),
    ADD COLUMN modification_requested_at TIMESTAMP,
    ADD COLUMN modification_decided_at   TIMESTAMP;
