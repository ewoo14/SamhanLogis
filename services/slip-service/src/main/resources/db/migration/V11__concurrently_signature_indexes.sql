-- V11__concurrently_signature_indexes.sql
-- Slip Service — Phase 10 W10-4 잔존 fix (PR #99) — DV-2 운영 가드 흡수 (D-P10-15 사용자 강화 가드 채택)
--
-- ⚠️ HOTFIX (2026-05-09): CONCURRENTLY 제거 — `idle in transaction` deadlock 회귀 차단.
--
-- 회귀 사고 history:
--   * PR #99 CI: slip-it-* group 60분 timeout (3차/4차/5차/6차 모두 fail) — V11 적용 후 발생
--   * PR #100 머지 후 로컬 docker-compose 환경 검증: V11 hang 47분 (slip-service fail)
--   * 진단: PostgreSQL CREATE INDEX CONCURRENTLY 가 다른 connection 의 idle transaction 을 무한 대기
--           (virtualxid lock). Flyway 의 schema check connection (PID N) 이 transaction 을 잡고
--           release 안 하면 V11 의 CONCURRENTLY connection 이 deadlock.
--
-- 본 fix:
--   * CONCURRENTLY 제거 → 일반 CREATE INDEX 사용
--   * 일반 CREATE INDEX = ACCESS EXCLUSIVE lock 잠시 (~ms 수준, 인덱스 빌드 동안)
--   * 운영 cutover 시점 slips 테이블 row 수에 따라 lock 시간 비례 (~1M rows 시 1-3초 추정)
--   * 1M rows 누적 전까지는 무시할 수준의 lock 영향
--
-- 운영 lock 영향 (production 시점):
--   * Phase 11 AWS cutover 시점 → slips 테이블 ~10K rows 추정 → lock < 100ms
--   * 1M+ rows 누적 시 → 별도 maintenance window 또는 V<후속> 으로 CONCURRENTLY 재시도
--   * V10 의 partial index 와 동일 효과, 다만 빌드 시간만 차이
--
-- 회귀 영향:
--   * V10 의 partial WHERE 절 (is_deleted = FALSE AND signature_source = 'APP' AND signed_at IS NOT NULL) 보존
--   * IF EXISTS / IF NOT EXISTS 가드 — 신규 환경 (V10 적용 직후) 과 운영 환경 모두 호환
--   * V11.sql.conf 는 audit Slice 5 (PR #256) 에서 cleanup 삭제됨 — 향후 CONCURRENTLY 재도입 시 신규 sidecar 작성
--
-- dev-report § 11-3 (Flyway V10/V11 lock 영향 시뮬레이션) 갱신 의무.

----------------------------------------------------------------------
-- 1) ix_slips_signature_source_app — 인수자 APP 서명 partial index 재생성
----------------------------------------------------------------------
DROP INDEX IF EXISTS ix_slips_signature_source_app;

CREATE INDEX IF NOT EXISTS ix_slips_signature_source_app
    ON slips (signed_at DESC)
    WHERE is_deleted = FALSE AND signature_source = 'APP' AND signed_at IS NOT NULL;

----------------------------------------------------------------------
-- 2) ix_slips_driver_signature_source_app — 기사 APP 서명 partial index 재생성
----------------------------------------------------------------------
DROP INDEX IF EXISTS ix_slips_driver_signature_source_app;

CREATE INDEX IF NOT EXISTS ix_slips_driver_signature_source_app
    ON slips (driver_signed_at DESC)
    WHERE is_deleted = FALSE AND driver_signature_source = 'APP' AND driver_signed_at IS NOT NULL;
