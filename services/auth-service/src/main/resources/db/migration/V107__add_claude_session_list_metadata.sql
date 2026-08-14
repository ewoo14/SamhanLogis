-- #901 S4 — 질문 시 한 번 저장한 목록 요약과 상태 메타데이터.
ALTER TABLE claude_conversation_sessions
    ADD COLUMN IF NOT EXISTS last_message TEXT,
    ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS summary_mode VARCHAR(32) NOT NULL DEFAULT 'REAL';

WITH latest_audit AS (
    SELECT DISTINCT ON (session_code)
        session_code,
        question,
        created_at,
        outbound_status
    FROM claude_conversation_audits
    WHERE session_code IS NOT NULL AND is_deleted = FALSE
    ORDER BY session_code, created_at DESC
)
UPDATE claude_conversation_sessions AS session
SET title = '대화 요약 없음',
    last_message = latest.question,
    last_message_at = latest.created_at,
    summary_mode = CASE WHEN latest.outbound_status = 'VIRTUAL_SENT' THEN 'VIRTUAL' ELSE 'REAL' END
FROM latest_audit AS latest
WHERE session.session_code = latest.session_code
  AND (session.title = '새 대화' OR session.last_message IS NULL);

UPDATE claude_conversation_sessions
SET title = 'Claude 세션'
WHERE title = '새 대화';
