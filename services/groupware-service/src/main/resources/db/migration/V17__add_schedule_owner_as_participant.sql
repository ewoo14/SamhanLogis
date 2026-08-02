-- 일정 등록자를 자동 대상자로 승격한다.
-- 기존 일정은 owner_id로 조회할 수 있었지만 schedule_participants에는 없었으므로
-- 대상자 기준 기능(알림 등)이 등록자를 누락하지 않도록 활성 행을 backfill한다.
INSERT INTO schedule_participants (
    id,
    schedule_id,
    participant_id,
    created_at,
    created_by,
    is_deleted
)
SELECT
    gen_random_uuid(),
    s.id,
    s.owner_id,
    CURRENT_TIMESTAMP,
    'migration-v17',
    FALSE
FROM schedules s
WHERE s.is_deleted = FALSE
  AND NOT EXISTS (
      SELECT 1
      FROM schedule_participants p
      WHERE p.schedule_id = s.id
        AND p.participant_id = s.owner_id
        AND p.is_deleted = FALSE
  );
