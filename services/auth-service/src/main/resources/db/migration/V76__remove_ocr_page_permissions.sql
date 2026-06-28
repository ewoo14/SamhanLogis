-- V76__remove_ocr_page_permissions.sql
-- OCR 메뉴 페이지 권한 전체 제거 (개발책임자 지시 2026-06-29).
-- 제거 대상:
--   purchases.receipt-ocr — 영수증 OCR (slip-service CLOVA 연동 제거)
--   sales.vendor-order    — 발주서 업로드 OCR (partner-order-service Tesseract 연동 제거)
--
-- V39 개편으로 role_page_permissions(DEPRECATED) → role_page_permission_templates /
-- account_page_permissions, V42/V43 → group_page_permissions(현 enforcement 진실원,
-- EffectivePermissionMaterializer 소비) 로 전파되었으므로
-- 전 테이블을 정리해야 orphan grant 재materialize 를 막는다.
-- account_permission_overrides 도 동일 page_code 기준 soft-delete (V59/V60 패턴 동일).

-- 1) 레거시(DEPRECATED) 원본 시드 — hard delete
DELETE FROM role_page_permissions
 WHERE page_code IN ('purchases.receipt-ocr', 'sales.vendor-order');

-- 2) enforcement/template 테이블 — soft delete (부분 unique uq_*_active WHERE is_deleted=FALSE)
UPDATE role_page_permission_templates
   SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = 'v76-ocr-removal'
 WHERE page_code IN ('purchases.receipt-ocr', 'sales.vendor-order') AND is_deleted = FALSE;
UPDATE account_page_permissions
   SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = 'v76-ocr-removal'
 WHERE page_code IN ('purchases.receipt-ocr', 'sales.vendor-order') AND is_deleted = FALSE;
UPDATE group_page_permissions
   SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = 'v76-ocr-removal'
 WHERE page_code IN ('purchases.receipt-ocr', 'sales.vendor-order') AND is_deleted = FALSE;
UPDATE account_permission_overrides
   SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = 'v76-ocr-removal'
 WHERE page_code IN ('purchases.receipt-ocr', 'sales.vendor-order') AND is_deleted = FALSE;
