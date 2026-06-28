-- OCR menu/page permission removal.
-- Applied migrations remain immutable; remove active rows with a new idempotent migration.

DELETE FROM account_page_permissions
WHERE page_code IN ('purchases.receipt-ocr', 'sales.vendor-order');

DELETE FROM group_page_permissions
WHERE page_code IN ('purchases.receipt-ocr', 'sales.vendor-order');

DELETE FROM role_page_permission_templates
WHERE page_code IN ('purchases.receipt-ocr', 'sales.vendor-order');

DELETE FROM role_page_permissions
WHERE page_code IN ('purchases.receipt-ocr', 'sales.vendor-order');
