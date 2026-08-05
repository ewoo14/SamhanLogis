-- V92: #1013 R12 — 삭제된 배차문자 발송 감사 화면의 권한 정본 회수.
-- V91은 deprecated role_page_permissions만 처리했다. V39/V42 이후 실제 권한은
-- 아래 다섯 테이블에 분산되므로 동일한 page_code의 활성 행만 soft delete한다.
-- 다른 화면의 권한과 이미 삭제된 이력은 변경하지 않는다.

UPDATE role_page_permissions
SET is_deleted = TRUE,
    deleted_at = NOW(),
    deleted_by = 'migration:V92',
    modified_at = NOW(),
    modified_by = 'migration:V92'
WHERE page_code = 'notification.dispatch-sms.send-audit'
  AND is_deleted = FALSE;

UPDATE role_page_permission_templates
SET is_deleted = TRUE,
    deleted_at = NOW(),
    deleted_by = 'migration:V92',
    modified_at = NOW(),
    modified_by = 'migration:V92'
WHERE page_code = 'notification.dispatch-sms.send-audit'
  AND is_deleted = FALSE;

UPDATE group_page_permissions
SET is_deleted = TRUE,
    deleted_at = NOW(),
    deleted_by = 'migration:V92',
    modified_at = NOW(),
    modified_by = 'migration:V92'
WHERE page_code = 'notification.dispatch-sms.send-audit'
  AND is_deleted = FALSE;

UPDATE account_page_permissions
SET is_deleted = TRUE,
    deleted_at = NOW(),
    deleted_by = 'migration:V92',
    modified_at = NOW(),
    modified_by = 'migration:V92'
WHERE page_code = 'notification.dispatch-sms.send-audit'
  AND is_deleted = FALSE;

UPDATE account_permission_overrides
SET is_deleted = TRUE,
    deleted_at = NOW(),
    deleted_by = 'migration:V92',
    modified_at = NOW(),
    modified_by = 'migration:V92'
WHERE page_code = 'notification.dispatch-sms.send-audit'
  AND is_deleted = FALSE;
