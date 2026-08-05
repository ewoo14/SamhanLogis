-- V91__retire_dispatch_sms_send_audit_permission.sql
-- #1013 Scope A: 배차안내문자는 표시·편집·복사만 제공한다.
-- 적용된 V7/V31/V32 권한 seed는 수정하지 않고, 과거 SEND_AUDIT page permission만
-- BaseEntity soft-delete로 비활성화한다. 공용 notification 권한은 건드리지 않는다.
UPDATE role_page_permissions
SET is_deleted = TRUE,
    deleted_at = NOW(),
    deleted_by = 'migration:V91',
    modified_at = NOW(),
    modified_by = 'migration:V91'
WHERE page_code = 'notification.dispatch-sms.send-audit'
  AND is_deleted = FALSE;
