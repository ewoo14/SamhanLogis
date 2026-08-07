-- V48__seed_driver_staff_dispatch_dev_accounts.sql
-- D-PCR-02 — 403 deny 실QA 상시화를 위한 DRIVER/STAFF/DISPATCH 개발 계정 seed.
--
-- 목적:
--   PR #420 dev-report §5 권한 retro-fit 이후, 카탈로그/배차 등 deny 경로를 Docker 실서버에서
--   매번 재현할 수 있도록 비MASTER 개발 계정을 고정 UUID 로 제공한다.
--
-- [DEV-SEED] 식별자 — production 절대 미적용 (Flyway location 분리 필요 시 별도 조치).
--
-- 계정 비밀번호 BCrypt 해시: QA_DEV_DEFAULT_PASSWORD
--   V5 해시는 평문 불일치 잠복 결함 — 본 해시는 #411 QA 검증분(checkpw=true).
-- password_change_required = FALSE:
--   계획서 §3 기준, 실QA 계정은 최초 로그인 비밀번호 변경 화면 없이 즉시 토큰 발급되어야 한다.
--   운영 리스크는 dev 계정 한정으로 수용하며, Phase 11 cutover 전 disable 또는 TRUE 전환을 검토한다.
--
-- V46 에서 accounts.role 컬럼이 제거되었으므로 역할 표현은 account_groups 배속만으로 완결한다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO accounts (
    id, login_id, password_hash, display_name, enabled,
    failed_login_attempts, locked_at,
    password_changed_at, password_history,
    password_change_required,
    created_at, created_by, modified_at, modified_by, is_deleted
) VALUES
-- [DEV-SEED] DRIVER 계정
(
    'b0000000-0000-0000-0000-00000000000a',
    'dev_driver',
    '$2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y',
    '[DEV-SEED] 기사',
    TRUE,
    0, NULL,
    NOW(), '[]'::jsonb,
    FALSE,
    NOW(), 'v48-dev-deny-accounts', NOW(), 'v48-dev-deny-accounts', FALSE
),
-- [DEV-SEED] STAFF 계정
(
    'b0000000-0000-0000-0000-00000000000b',
    'dev_staff',
    '$2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y',
    '[DEV-SEED] 사원',
    TRUE,
    0, NULL,
    NOW(), '[]'::jsonb,
    FALSE,
    NOW(), 'v48-dev-deny-accounts', NOW(), 'v48-dev-deny-accounts', FALSE
),
-- [DEV-SEED] DISPATCH 계정
(
    'b0000000-0000-0000-0000-00000000000c',
    'dev_dispatch',
    '$2b$12$g9/AnrEr4.fxZoV7GPOraOoMLkysbtYnO0joHqluMPGgPpjBqQf0y',
    '[DEV-SEED] 배차담당자',
    TRUE,
    0, NULL,
    NOW(), '[]'::jsonb,
    FALSE,
    NOW(), 'v48-dev-deny-accounts', NOW(), 'v48-dev-deny-accounts', FALSE
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO account_groups
    (id, account_id, group_id,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    dev_groups.account_id,
    dev_groups.group_id,
    NOW(),
    'v48-dev-deny-accounts',
    NOW(),
    'v48-dev-deny-accounts',
    FALSE
FROM (
    VALUES
        ('b0000000-0000-0000-0000-00000000000a'::uuid, '00000000-0000-0000-0000-000000000107'::uuid),
        ('b0000000-0000-0000-0000-00000000000b'::uuid, '00000000-0000-0000-0000-000000000108'::uuid),
        ('b0000000-0000-0000-0000-00000000000c'::uuid, '00000000-0000-0000-0000-000000000106'::uuid)
) AS dev_groups(account_id, group_id)
ON CONFLICT (account_id, group_id) WHERE is_deleted = FALSE DO NOTHING;

-- ---------------------------------------------------------------------------
-- 신규 개발 계정 enforcement 캐시 동기화.
--
-- V47 products.sync materialize 와 동일한 집계 시맨틱:
--   - 계정이 배속된 모든 활성 그룹의 page 권한을 BOOL_OR 로 합성한다.
--   - 시스템 마스터 그룹 배속 계정은 X-Is-System-Master bypass 대상이므로 제외한다.
--   - 비활성/삭제 계정 및 soft-delete 된 그룹/권한 행은 제외한다.
--
-- 특히 DRIVER/STAFF 의 products.list 처럼 명시 FALSE row 가 있는 페이지도 account_page_permissions 에
-- 빈 action 집합으로 내려가야 실QA에서 "권한 없음" 계약을 안정적으로 관찰할 수 있다.
-- ---------------------------------------------------------------------------

INSERT INTO account_page_permissions
    (id, account_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    ag.account_id,
    gpp.page_code,
    BOOL_OR(gpp.can_view),
    BOOL_OR(gpp.can_create),
    BOOL_OR(gpp.can_update),
    BOOL_OR(gpp.can_delete),
    BOOL_OR(gpp.can_restore),
    BOOL_OR(gpp.can_download),
    BOOL_OR(gpp.can_print),
    NOW(),
    'v48-dev-deny-accounts',
    NOW(),
    'v48-dev-deny-accounts',
    FALSE
FROM account_groups ag
JOIN accounts a
  ON a.id = ag.account_id
 AND a.is_deleted = FALSE
 AND a.enabled = TRUE
JOIN group_page_permissions gpp
  ON gpp.group_id = ag.group_id
 AND gpp.is_deleted = FALSE
WHERE ag.is_deleted = FALSE
  AND ag.account_id IN (
      'b0000000-0000-0000-0000-00000000000a'::uuid,
      'b0000000-0000-0000-0000-00000000000b'::uuid,
      'b0000000-0000-0000-0000-00000000000c'::uuid
  )
  AND NOT EXISTS (
      SELECT 1
      FROM account_groups sg
      JOIN permission_groups pg
        ON pg.id = sg.group_id
       AND pg.is_deleted = FALSE
       AND pg.is_system_master = TRUE
      WHERE sg.account_id = ag.account_id
        AND sg.is_deleted = FALSE
  )
GROUP BY ag.account_id, gpp.page_code
ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update,
    can_delete = EXCLUDED.can_delete,
    can_restore = EXCLUDED.can_restore,
    can_download = EXCLUDED.can_download,
    can_print = EXCLUDED.can_print,
    modified_at = NOW(),
    modified_by = 'v48-dev-deny-accounts';
