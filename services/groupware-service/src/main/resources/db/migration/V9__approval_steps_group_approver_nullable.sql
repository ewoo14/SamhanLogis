-- V9__approval_steps_group_approver_nullable.sql
-- A2-G1: 중앙 config 결재선 인스턴스화로 GROUP 결재 단계가 도입된다.
-- GROUP 단계는 개인 결재자(approver_id) 없이 권한그룹(approver_group_id)으로 식별하므로
-- V1 의 approver_id NOT NULL 제약을 해제한다. (기존 행은 전부 USER=approver_id 보유 → 무손상.)

ALTER TABLE approval_steps ALTER COLUMN approver_id DROP NOT NULL;

-- 단계 타입별 결재자 식별 무결성: GROUP=approver_group_id 필수, 그 외(USER/CREATOR)=approver_id 필수.
-- 기존 행(step_type=USER, approver_id NOT NULL)은 즉시 충족한다.
ALTER TABLE approval_steps DROP CONSTRAINT IF EXISTS ck_approval_steps_approver_identity;
ALTER TABLE approval_steps ADD CONSTRAINT ck_approval_steps_approver_identity CHECK (
    (step_type = 'GROUP' AND approver_group_id IS NOT NULL)
    OR (step_type <> 'GROUP' AND approver_id IS NOT NULL)
);
