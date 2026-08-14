-- #901 접근 거부 시도도 신원을 알 수 없으면 NULL account_id로 감사 보존한다.
ALTER TABLE claude_conversation_audits ALTER COLUMN account_id DROP NOT NULL;
