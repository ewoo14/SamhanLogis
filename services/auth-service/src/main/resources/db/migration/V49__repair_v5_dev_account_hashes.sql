-- V49__repair_v5_dev_account_hashes.sql
-- V5 P0-5 개발 계정 9건의 비밀번호 해시 결함을 교정한다.
--
-- 결함 출처:
--   PR #411 QA 에서 V5 공통 해시가 문서된 QA_DEV_DEFAULT_PASSWORD 와 불일치함을
--   bcrypt.checkpw=False 로 실증했다.
--   근거: docs/qa/permission-groups-phase-c-fullstack/real-qa-evidence.md:38
--
-- 교체 해시 검증 근거:
--   PR #421 V48 개발 계정에서 아래 BCrypt 해시로 QA_DEV_DEFAULT_PASSWORD 실로그인 200 을 실증했다.
--
-- [DEV-SEED] 식별자 — production 절대 미적용 (Flyway location 분리 필요 시 별도 조치).
--
-- 이중 가드:
--   1) V5 고정 UUID 9건만 대상으로 제한한다.
--   2) 기존 결함 해시가 그대로 남아 있는 행만 갱신한다.
-- dev_disabled(id 009, is_deleted=TRUE)는 @SQLRestriction 으로 로그인 해시 검증 미도달이라 방어적 포함이다.
-- 운영자가 수동 변경한 비밀번호는 덮어쓰지 않으며, 재실행 시 0 row 갱신되는 멱등 migration 이다.
-- password_change_required 등 정책 컬럼은 변경하지 않는다.

UPDATE accounts
   SET password_hash = '$2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y',
       modified_at = NOW(),
       modified_by = 'v49-hash-repair'
 WHERE id IN (
       'a0000000-0000-0000-0000-000000000001'::uuid,
       'a0000000-0000-0000-0000-000000000002'::uuid,
       'a0000000-0000-0000-0000-000000000003'::uuid,
       'a0000000-0000-0000-0000-000000000004'::uuid,
       'a0000000-0000-0000-0000-000000000005'::uuid,
       'a0000000-0000-0000-0000-000000000006'::uuid,
       'a0000000-0000-0000-0000-000000000007'::uuid,
       'a0000000-0000-0000-0000-000000000008'::uuid,
       'a0000000-0000-0000-0000-000000000009'::uuid
   )
   AND password_hash = '$2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu';
