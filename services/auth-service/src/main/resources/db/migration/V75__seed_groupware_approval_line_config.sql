-- V75__seed_groupware_approval_line_config.sql
-- A2-G1 그룹웨어 결재유형 예시 결재라인 seed.
-- approval_steps GROUP 컬럼은 groupware V8 에 이미 적용되어 있으므로 auth config seed 만 추가한다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO approval_line_config
    (id, document_type, sequence, label, step_type, action_key, required, created_by)
SELECT gen_random_uuid(), v.document_type, v.sequence, v.label, v.step_type, v.action_key, TRUE, 'v75-seed'
FROM (VALUES
    ('GROUPWARE_EXPENSE_REPORT', 0, '작성자', 'CREATOR', NULL),
    ('GROUPWARE_EXPENSE_REPORT', 1, '부서장', 'GROUP', 'groupware.approvals'),
    ('GROUPWARE_EXPENSE_REPORT', 2, '대표', 'USER', NULL)
) AS v(document_type, sequence, label, step_type, action_key)
WHERE NOT EXISTS (
    SELECT 1
      FROM approval_line_config a
     WHERE a.document_type = v.document_type
       AND a.sequence = v.sequence
       AND a.is_deleted = FALSE
);

INSERT INTO approval_line_approver
    (id, config_role_id, approver_type, approver_ref_id,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), role.id, v.approver_type, v.approver_ref_id,
       NOW(), 'v75-seed', NOW(), 'v75-seed', FALSE
FROM (VALUES
    (1, 'GROUP', '00000000-0000-0000-0000-000000000101'::uuid),
    -- TODO: 실 배포 전 관리자 UI 에서 실 대표이사 계정 UUID 로 교체
    --       현재 값(a0000000-0000-0000-0000-000000000001)은 시드 placeholder 임
    (2, 'USER',  'a0000000-0000-0000-0000-000000000001'::uuid)
) AS v(sequence, approver_type, approver_ref_id)
JOIN approval_line_config role
  ON role.document_type = 'GROUPWARE_EXPENSE_REPORT'
 AND role.sequence = v.sequence
 AND role.is_deleted = FALSE
WHERE NOT EXISTS (
    SELECT 1
      FROM approval_line_approver existing
     WHERE existing.config_role_id = role.id
       AND existing.approver_type = v.approver_type
       AND existing.approver_ref_id = v.approver_ref_id
       AND existing.is_deleted = FALSE
);
