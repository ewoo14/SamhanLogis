-- 권한 표시명(UUID 비공개)과 내부 요청자 역추적 키를 분리한다.
ALTER TABLE role_page_permissions ADD COLUMN IF NOT EXISTS actor_id VARCHAR(100);
ALTER TABLE role_page_permission_templates ADD COLUMN IF NOT EXISTS actor_id VARCHAR(100);
ALTER TABLE account_page_permissions ADD COLUMN IF NOT EXISTS actor_id VARCHAR(100);
ALTER TABLE account_permission_overrides ADD COLUMN IF NOT EXISTS actor_id VARCHAR(100);
ALTER TABLE group_page_permissions ADD COLUMN IF NOT EXISTS actor_id VARCHAR(100);

COMMENT ON COLUMN role_page_permissions.actor_id IS '권한 변경 요청자 내부 식별자. 화면 표시용 아님.';
COMMENT ON COLUMN role_page_permission_templates.actor_id IS '권한 변경 요청자 내부 식별자. 화면 표시용 아님.';
COMMENT ON COLUMN account_page_permissions.actor_id IS 'effective 권한을 만든 내부 요청자 식별자. 화면 표시용 아님.';
COMMENT ON COLUMN account_permission_overrides.actor_id IS '계정 권한 변경 요청자 내부 식별자. 화면 표시용 아님.';
COMMENT ON COLUMN group_page_permissions.actor_id IS '권한그룹 권한 변경 요청자 내부 식별자. 화면 표시용 아님.';
