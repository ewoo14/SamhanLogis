-- V55__seed_groupware_approvals_page_permission.sql
-- §7 슬라이스6 그룹웨어 결재(Approval) 협업 — 신규 page-code `groupware.approvals` 권한 시드.
--
-- 결재 목록/상세 + 협업(수정완료/코멘트) 화면을 가드한다. 기존 그룹웨어 관리 게이트
-- (messenger.admin = MASTER/MANAGER)를 미러링한다. MASTER 는 DynamicPermissionService
-- 가 PageCode.values() 전체를 동적 반환하므로 enum 추가만으로도 전권이지만, 매트릭스
-- 조회/위임 일관성을 위해 명시 row 도 함께 시드한다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER', 'groupware.approvals', TRUE, TRUE, NOW(), 'system', FALSE),
    (gen_random_uuid(), 'MANAGER', 'groupware.approvals', TRUE, TRUE, NOW(), 'system', FALSE)
ON CONFLICT DO NOTHING;
