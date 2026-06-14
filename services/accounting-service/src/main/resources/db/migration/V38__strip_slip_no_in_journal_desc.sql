-- V38: 분개 적요(journals.description)에 텍스트로 박제된 전표번호의 순번부 선행 0 제거 (전역 표준화)
--
-- 배경: slip-service V47__strip_slip_no_zeros.sql 이 slip_db 의 slips.slip_no 만 0제거했고,
-- accounting_db.journals.description 에는 "전표 2026/04/01-001 자동 분개 (출하 매출)" 형태로
-- zero-pad 전표번호가 텍스트로 남아 전역 표준(yyyy/MM/dd-{번호}, 순번 0제거)과 불일치.
-- service-per-DB 구조상 V47 이 다른 DB(accounting_db)를 건드릴 수 없으므로 본 마이그레이션으로 보정.
--
-- 규칙: 날짜부(yyyy/MM/dd)의 0 은 보존하고, '-' 뒤 순번부 선행 0 만 제거.
--   예: 2026/04/01-001 -> 2026/04/01-1, 2026/04/10-012 -> 2026/04/10-12
--   날짜부 캡처 그룹(\1)으로 보존, 0+ 는 마지막 한 자리([0-9]) 직전까지의 선행 0 을 소비.
-- 'g' 플래그 — 한 적요 문자열에 전표번호가 둘 이상 표기된 경우까지 모두 치환.
--
-- 검증: 운영 29건이 zero-pad(2026/04/01-001 …) 형태. 적용 후 description ~ '...-0[0-9]' 매칭 0건 기대.
-- (seed 적요 INSERT 는 별도로 존재하지 않으며 본 보정은 런타임/시드 적재된 영속 데이터를 전진 정정.)

UPDATE journals
SET description = regexp_replace(description, '([0-9]{4}/[0-9]{2}/[0-9]{2})-0+([0-9])', '\1-\2', 'g')
WHERE description ~ '[0-9]{4}/[0-9]{2}/[0-9]{2}-0[0-9]';
