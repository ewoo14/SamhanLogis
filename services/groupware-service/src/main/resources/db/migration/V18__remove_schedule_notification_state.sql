-- 일정 알림 발행을 후속 슬라이스로 이월하면서 전용 상태 컬럼을 제거한다.
ALTER TABLE schedule_participants
    DROP COLUMN IF EXISTS notification_requested_at;
