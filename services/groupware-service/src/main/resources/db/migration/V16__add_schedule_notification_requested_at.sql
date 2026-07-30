-- 확정 일정 대상자별 알림 발행 요청 중복 방지 상태
ALTER TABLE schedule_participants
    ADD COLUMN notification_requested_at TIMESTAMP;

COMMENT ON COLUMN schedule_participants.notification_requested_at IS
    '확정 일정 대상자 알림 발행 요청을 일정 트랜잭션에 기록한 시각';
