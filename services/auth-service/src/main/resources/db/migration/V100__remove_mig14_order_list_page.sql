-- MIG-14 주문 목록·상세 silo 폐기 — native partner_orders(/sales/partner-orders)로 단일화.
-- V25/V31/V32의 기존 seed는 불변으로 두고, 현재 권한 모델의 활성 행만 정리한다.

-- 1) 레거시 role_page_permissions 원본 seed soft delete
UPDATE role_page_permissions
   SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = 'migration:V100',
       modified_at = NOW(), modified_by = 'migration:V100'
 WHERE page_code = 'ecount.mig14.order-list' AND is_deleted = FALSE;

-- 2) enforcement/template 및 materialized 권한 행 soft delete
UPDATE role_page_permission_templates
   SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = 'v100-mig14-order-list-removal'
 WHERE page_code = 'ecount.mig14.order-list' AND is_deleted = FALSE;

UPDATE account_page_permissions
   SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = 'v100-mig14-order-list-removal'
 WHERE page_code = 'ecount.mig14.order-list' AND is_deleted = FALSE;

UPDATE group_page_permissions
   SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = 'v100-mig14-order-list-removal'
 WHERE page_code = 'ecount.mig14.order-list' AND is_deleted = FALSE;

UPDATE account_permission_overrides
   SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = 'v100-mig14-order-list-removal'
 WHERE page_code = 'ecount.mig14.order-list' AND is_deleted = FALSE;
