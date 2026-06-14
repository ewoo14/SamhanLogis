-- V7: approval attachment 전표번호 참조 사본 0제거
--
-- 개발책임자 "회계전표 포함 모든 전표번호 0제거" 확정 범위에 맞춰
-- groupware approval_attachments.ref_slip_no 에 남을 수 있는 slip 전표번호
-- 참조 사본을 yyyy/MM/dd-N 형식으로 정규화한다.
--
-- 현 dev/운영 조사 결과 ref_slip_no zero-pad 는 0건으로 clean 이지만,
-- 운영 cutover 및 향후 import/연동 데이터에 대한 멱등 가드로 forward-only 보정한다.
--
-- taxInvoice(세금계산서 발행번호)는 법정/홈택스 노출 번호이므로 범위 외다.

UPDATE approval_attachments
SET ref_slip_no = regexp_replace(ref_slip_no, '-0+([0-9])', '-\1')
WHERE ref_slip_no ~ '-0[0-9]';
