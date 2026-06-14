-- 전표번호 저장값의 순번부 선행 0을 제거한다.
-- 예: 2026/01/01-001 -> 2026/01/01-1
--
-- [unique 충돌 가드] 현 운영 데이터 기준 (slip_type, slip_no) unique 충돌 0건 확인 후 적용한다.
-- 단, 같은 (날짜/유형)에 zero-pad(...-001)와 no-pad(...-1)가 혼재하는 환경은 0제거 시
-- 동일 번호로 수렴하여 unique 위반이 발생할 수 있으므로 본 마이그레이션은 그 경우를 미보장.
-- (그런 환경에서는 사전 dedup/재채번 마이그레이션을 선행한 뒤 본 0제거를 적용해야 한다.)

UPDATE slips
SET slip_no = regexp_replace(slip_no, '-0+([0-9])', '-\1')
WHERE slip_no ~ '-0[0-9]';

-- 보상 실패 감사 테이블은 slips.slip_no 역정규화 사본이므로 같은 규칙으로 동반 보정한다.
UPDATE serial_compensation_failures
SET slip_no = regexp_replace(slip_no, '-0+([0-9])', '-\1')
WHERE slip_no ~ '-0[0-9]';
