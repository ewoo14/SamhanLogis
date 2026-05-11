-- V6__seed_executive_office_guard.sql
-- Phase 12 인사 카테고리 가드 — 대표실 부서 존재 보장 + 관련 인덱스.
--
-- '대표실' 부서는 V2__seed_org_chart.sql 에서 이미 seed.
-- code='EXEC', id='00000000-0000-0000-0000-000000000001'.
--
-- 본 migration 은 '대표실' 이 누락된 환경(빈 DB 재생성 등)을 대비한 멱등 INSERT +
-- department.name 유니크 인덱스 생성.
-- V2 가 정상 실행된 환경에서는 ON CONFLICT 로 인해 skip.

INSERT INTO departments (id, code, name, display_order, created_at, created_by, is_deleted)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'EXEC',
    '대표실',
    1,
    NOW(),
    'system',
    FALSE
)
ON CONFLICT (id) DO NOTHING;

-- [DEV-SEED] MASTER / DEVELOPER / MANAGER 계정은 V5 에서 이미 대표실 부서 배정됨.
-- auth-service.accounts.department_name backfill 은 auth-service V6 migration 에서 수행.
-- (cross-DB migration 은 service 경계 위반 — 각 서비스 migration 분리 원칙 준수)
