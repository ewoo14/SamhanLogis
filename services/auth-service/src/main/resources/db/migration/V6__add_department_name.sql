-- V6__add_department_name.sql
-- Phase 12 인사 카테고리 가드 — accounts 테이블에 department_name 컬럼 추가.
--
-- JWT departmentName claim 원본 값 저장. user-service 가 직원 등록/부서 변경 시
-- /auth/internal/accounts/{id}/department-name 로 동기화.
-- NULLable: 기존 계정 / 부서 미배정 계정은 NULL → 인사 가드 항상 403.
--
-- Legacy 호환: 기존 row 는 NULL (변경 없음). 기존 endpoint 영향 0건.

ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS department_name VARCHAR(100);

-- [DEV-SEED] MASTER 계정(a0000000-...-000000000001) 을 '대표실' 로 초기 backfill.
-- 실 운영 환경에서는 user-service 부서 변경 시 자동 동기화.
UPDATE accounts
SET department_name = '대표실'
WHERE id = 'a0000000-0000-0000-0000-000000000001'
  AND department_name IS NULL;
