-- V56__seed_groupware_approvals_account_enforcement.sql
-- §7 슬라이스6 그룹웨어 결재(Approval) collab — page-code `groupware.approvals` 의
-- BE enforcement 시드.
--
-- 배경: V55 는 role_page_permissions(레거시 FE 매트릭스 /auth/admin/permissions/my
-- 비-MASTER 경로)만 시드했으나, @RequirePermission enforcement 는
-- PermissionAspect → DynamicPermissionClient → account_page_permissions 를 조회한다.
-- C5 이후 실권한 진실원 = group_page_permissions(→ materializer 가 account 캐시 재계산).
-- Flyway 직접 seed 는 materializer 를 거치지 않으므로 group + account 양쪽을 직접 동기화한다
-- (V47 products.sync 패턴 동일). 비-MASTER 계정 collab UPDATE 403 차단 fix.
--
-- 부여 대상: 기존 그룹웨어 관리 게이트 messenger.admin 과 동일하게 V43 빌트인 MANAGER
-- 그룹(00000000-0000-0000-0000-000000000101)에 view+update. MASTER(시스템 마스터 그룹)는
-- X-Is-System-Master bypass 로 통과하므로 account materialize 대상에서 제외한다.
-- collab 엔드포인트: VIEW = GET comments/edits/stream, UPDATE = POST edits + 코멘트 CUD.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- (1) group_page_permissions — MANAGER 빌트인 그룹에 groupware.approvals view+update
INSERT INTO group_page_permissions
    (id, group_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000101'::uuid, 'groupware.approvals',
     TRUE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE,
     NOW(), 'v56-groupware-approvals', NOW(), 'v56-groupware-approvals', FALSE)
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update,
    can_delete = EXCLUDED.can_delete,
    can_restore = EXCLUDED.can_restore,
    can_download = EXCLUDED.can_download,
    can_print = EXCLUDED.can_print,
    modified_at = NOW(),
    modified_by = 'v56-groupware-approvals';

-- (2) account_page_permissions — 그룹 배속 계정 enforcement 캐시 동기화 (V47 패턴 동일)
--     집계 = 배속 활성 그룹의 groupware.approvals 권한 BOOL_OR. 시스템 마스터 그룹 배속
--     계정은 제외(X-Is-System-Master bypass). 비활성/삭제 계정 제외.
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
    'v56-groupware-approvals',
    NOW(),
    'v56-groupware-approvals',
    FALSE
FROM account_groups ag
JOIN accounts a
  ON a.id = ag.account_id
 AND a.is_deleted = FALSE
 AND a.enabled = TRUE
JOIN group_page_permissions gpp
  ON gpp.group_id = ag.group_id
 AND gpp.is_deleted = FALSE
 AND gpp.page_code = 'groupware.approvals'
WHERE ag.is_deleted = FALSE
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
    modified_by = 'v56-groupware-approvals';
