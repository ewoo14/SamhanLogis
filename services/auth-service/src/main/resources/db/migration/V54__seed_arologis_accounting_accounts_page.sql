-- V54__seed_arologis_accounting_accounts_page.sql
-- 2026-06-09 — arologis-desktop 백오피스: 간이 회계 "계정과목 관리"(활성상태 토글) page-code grant.
--
-- 개발책임자 지시(2026-06-09): 계정과목 활성상태 설정 권한 = 대표실·회계팀.
--   → 아로로지스 롤 매핑: 대표실=마스터(AROLOGIS_MASTER), 회계팀=회계사원(AROLOGIS_ACCOUNTANT).
--   → 마스터/회계사원만 V/E, 나머지 4롤(매니저/개발자/영업사원/배송기사)은 차단.
--      (현금출납장 arologis.accounting.cashbook 과 분리된 별도 page-code — 회계 거래 입력 권한이
--       있어도 계정과목 마스터 활성상태 관리는 못 하도록 격리.)
--
-- arologis-service DynamicPermissionClientConfig 가 AROLOGIS_* → 중앙 코드(MASTER/MANAGER/
-- DEVELOPER/SALES/ACCOUNTANT/DRIVER)로 정규화하므로 중앙 role code 로만 적재한다(V53 선례).

INSERT INTO role_page_permissions
  (role_code, page_code, can_view, can_edit,
   created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
  -- ── arologis.accounting.accounts — 계정과목 관리(활성상태) ──────────────
  -- 마스터(대표실)·회계사원(회계팀)만 V/E. 나머지는 접근 차단.
  ('MASTER',     'arologis.accounting.accounts', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('ACCOUNTANT', 'arologis.accounting.accounts', TRUE,  TRUE,  NOW(), 'system', NOW(), 'system', FALSE),
  ('MANAGER',    'arologis.accounting.accounts', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DEVELOPER',  'arologis.accounting.accounts', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('SALES',      'arologis.accounting.accounts', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE),
  ('DRIVER',     'arologis.accounting.accounts', FALSE, FALSE, NOW(), 'system', NOW(), 'system', FALSE)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING;
