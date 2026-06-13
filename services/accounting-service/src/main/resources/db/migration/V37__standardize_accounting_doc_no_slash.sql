-- V37: 회계 문서 번호 표준화
-- 기존 적용 이력이 있는 seed migration(V6/V8/V9/V10/V12)은 checksum 보호를 위해 수정하지 않는다.
-- 표시/저장용 회계 문서 번호만 입출고전표 표준 형식(yyyy/MM/dd-{번호})으로 전진 갱신한다.

-- V6 report validation journal seeds
UPDATE journals SET journal_no = '2026/01/15-1' WHERE id = 'fd0a7b35-3f5a-3b2d-ab94-44f45d25c7f6';
UPDATE journals SET journal_no = '2026/02/10-1' WHERE id = '9b9d37e4-7623-3e55-87a1-8fd4e3a06e70';
UPDATE journals SET journal_no = '2026/01/15-2' WHERE id = '51e4a24e-cf18-3b54-a10b-a5e7b831f52d';
UPDATE journals SET journal_no = '2026/01/31-1' WHERE id = '4e60aa22-c45a-3a4e-9f0c-f7a3c5b9d6e1';
UPDATE journals SET journal_no = '2026/02/28-1' WHERE id = '2a7f1c8b-5e3d-3c6a-b2f8-d9e4a1c7f3b0';
UPDATE journals SET journal_no = '2026/03/31-1' WHERE id = 'c3d5e8a1-b4f2-3d7c-98e6-a2f9b0c4e7d3';
UPDATE journals SET journal_no = '2026/12/31-1' WHERE id = '7f2e9c4b-d1a3-3e8f-b5c7-e0d6a4f2b9c8';

-- V9 partner aging journal seeds
UPDATE journals SET journal_no = '2026/04/05-1' WHERE id = 'c2d3e4f5-a6b7-8901-cdef-012345678901';
UPDATE journals SET journal_no = '2026/04/15-1' WHERE id = 'c2d3e4f5-a6b7-8901-cdef-012345678902';
UPDATE journals SET journal_no = '2026/04/25-1' WHERE id = 'c2d3e4f5-a6b7-8901-cdef-012345678903';
UPDATE journals SET journal_no = '2026/04/10-1' WHERE id = 'c2d3e4f5-a6b7-8901-cdef-012345678911';
UPDATE journals SET journal_no = '2026/04/20-1' WHERE id = 'c2d3e4f5-a6b7-8901-cdef-012345678912';

-- V10 cash flow/equity validation journal seeds
UPDATE journals SET journal_no = '2027/01/05-1' WHERE id = 'd1c2b3a4-e5f6-7890-abcd-ef0123456701';
UPDATE journals SET journal_no = '2027/01/10-1' WHERE id = 'd1c2b3a4-e5f6-7890-abcd-ef0123456702';
UPDATE journals SET journal_no = '2027/01/15-1' WHERE id = 'd1c2b3a4-e5f6-7890-abcd-ef0123456703';
UPDATE journals SET journal_no = '2027/01/20-1' WHERE id = 'd1c2b3a4-e5f6-7890-abcd-ef0123456704';
UPDATE journals SET journal_no = '2027/01/25-1' WHERE id = 'd1c2b3a4-e5f6-7890-abcd-ef0123456705';
UPDATE journals SET journal_no = '2027/01/02-1' WHERE id = 'd1c2b3a4-e5f6-7890-abcd-ef0123456711';
UPDATE journals SET journal_no = '2027/01/30-1' WHERE id = 'd1c2b3a4-e5f6-7890-abcd-ef0123456712';

-- V8 VAT validation tax invoice seeds
UPDATE tax_invoices SET tax_invoice_no = '2026/04/05-0001' WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567801';
UPDATE tax_invoices SET tax_invoice_no = '2026/04/15-0001' WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567802';
UPDATE tax_invoices SET tax_invoice_no = '2026/04/25-0001' WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567803';
UPDATE tax_invoices SET tax_invoice_no = '2026/04/10-0001' WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567811';
UPDATE tax_invoices SET tax_invoice_no = '2026/04/20-0001' WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567812';

-- V12 tax invoice issuance seeds
UPDATE tax_invoices SET tax_invoice_no = '2026/05/03-0001' WHERE id = 'c0d0e0f0-1234-5678-abcd-000000000201';
UPDATE tax_invoices SET tax_invoice_no = '2026/05/07-0001' WHERE id = 'c0d0e0f0-1234-5678-abcd-000000000202';
UPDATE tax_invoices SET tax_invoice_no = '2026/05/09-0001' WHERE id = 'c0d0e0f0-1234-5678-abcd-000000000203';
UPDATE tax_invoices SET tax_invoice_no = '2026/04/28-0001' WHERE id = 'c0d0e0f0-1234-5678-abcd-000000000301';
