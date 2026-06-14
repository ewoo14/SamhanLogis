-- V39: 회계전표/세금계산서 전표번호 계열 0제거
--
-- 개발책임자 "회계전표 포함 모든 전표번호 0제거" 및 "세금계산서도 0제거" 확정 범위.
-- sales/purchase 회계전표의 slip_no, allocation source_slip_no 사본,
-- 세금계산서 발행번호 tax_invoice_no, tax_invoice_batches.excluded_slip_nos 를
-- yyyy/MM/dd-N 형식으로 정규화한다. 파일명은 최초 작성 범위를 유지한다.
--
-- 현 dev 데이터는 sales_accounting_slips/purchase_accounting_slips 0건,
-- allocation 0건으로 no-op 이지만, 운영 tax_invoices 9건은 4자리 zero-pad 이므로
-- 실제 보정 대상이다. excluded_slip_nos 는 현재 clean 이지만 향후 import/연동 데이터에
-- 대한 멱등 가드로 forward-only 보정한다.
--
-- slip_no UNIQUE 및 tax_invoices active UNIQUE(ux_tax_invoices_no_active)는 0제거 후
-- 동일 번호 충돌 가능성이 있다. 현 회계전표 0건, 운영 tax_invoice_no 9건은 날짜별
-- distinct zero-pad 로 충돌 없음이 확인됐으며, 운영 cutover 전 중복 probe 로 재확인한다.
--
-- batch_no(TIB-yyyyMM-NNN)는 세금계산서 발행번호가 아닌 배치 그룹ID/정렬용 별도 체계이므로
-- 범위 외다.

UPDATE sales_accounting_slips
SET slip_no = regexp_replace(slip_no, '^([0-9]{4}/[0-9]{2}/[0-9]{2})-0+([1-9][0-9]*)$', '\1-\2')
WHERE slip_no ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}-0+[1-9][0-9]*$';

UPDATE purchase_accounting_slips
SET slip_no = regexp_replace(slip_no, '^([0-9]{4}/[0-9]{2}/[0-9]{2})-0+([1-9][0-9]*)$', '\1-\2')
WHERE slip_no ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}-0+[1-9][0-9]*$';

UPDATE sales_accounting_slip_allocations
SET source_slip_no = regexp_replace(source_slip_no, '^([0-9]{4}/[0-9]{2}/[0-9]{2})-0+([1-9][0-9]*)$', '\1-\2')
WHERE source_slip_no ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}-0+[1-9][0-9]*$';

UPDATE purchase_accounting_slip_allocations
SET source_slip_no = regexp_replace(source_slip_no, '^([0-9]{4}/[0-9]{2}/[0-9]{2})-0+([1-9][0-9]*)$', '\1-\2')
WHERE source_slip_no ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}-0+[1-9][0-9]*$';

UPDATE tax_invoices
SET tax_invoice_no = regexp_replace(tax_invoice_no, '^([0-9]{4}/[0-9]{2}/[0-9]{2})-0+([1-9][0-9]*)$', '\1-\2')
WHERE tax_invoice_no ~ '^[0-9]{4}/[0-9]{2}/[0-9]{2}-0+[1-9][0-9]*$';

UPDATE tax_invoice_batches
SET excluded_slip_nos = regexp_replace(excluded_slip_nos, '([0-9]{4}/[0-9]{2}/[0-9]{2})-0+([1-9][0-9]*)', '\1-\2', 'g')
WHERE excluded_slip_nos ~ '[0-9]{4}/[0-9]{2}/[0-9]{2}-0+[1-9][0-9]*';
