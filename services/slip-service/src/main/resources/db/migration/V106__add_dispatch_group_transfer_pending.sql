-- S16: 원격 수신 응답 유실 시 양쪽 결과를 재확인할 때까지 로컬 변경을 잠근다.
ALTER TABLE dispatch_groups
    DROP CONSTRAINT IF EXISTS dispatch_groups_transfer_status_check;

ALTER TABLE dispatch_groups
    ADD CONSTRAINT dispatch_groups_transfer_status_check
        CHECK (transfer_status IN ('NOT_SENT', 'SENT', 'FAILED', 'PENDING'));
