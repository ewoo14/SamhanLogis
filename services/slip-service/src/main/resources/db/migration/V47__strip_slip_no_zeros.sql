-- 전표번호 저장값의 순번부 선행 0을 제거한다.
-- 예: 2026/01/01-001 -> 2026/01/01-1

UPDATE slips
SET slip_no = regexp_replace(slip_no, '-0+([0-9])', '-\1')
WHERE slip_no ~ '-0[0-9]';

-- 보상 실패 감사 테이블은 slips.slip_no 역정규화 사본이므로 같은 규칙으로 동반 보정한다.
UPDATE serial_compensation_failures
SET slip_no = regexp_replace(slip_no, '-0+([0-9])', '-\1')
WHERE slip_no ~ '-0[0-9]';
