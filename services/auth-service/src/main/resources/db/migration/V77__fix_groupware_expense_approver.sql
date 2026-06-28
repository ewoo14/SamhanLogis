-- V77__fix_groupware_expense_approver.sql
-- GROUPWARE_EXPENSE_REPORT seq2 placeholder approver must not be MASTER/dev_master.
-- V75 is immutable after application, so this migration moves the representative
-- USER placeholder from dev_master(a000...0001) to non-MASTER dev_manager(a000...0003).

UPDATE approval_line_approver approver
   SET approver_ref_id = 'a0000000-0000-0000-0000-000000000003'::uuid,
       modified_at = NOW(),
       modified_by = 'v77-fix-groupware-expense-approver'
  FROM approval_line_config role
 WHERE approver.config_role_id = role.id
   AND role.document_type = 'GROUPWARE_EXPENSE_REPORT'
   AND role.sequence = 2
   AND role.step_type = 'USER'
   AND role.is_deleted = FALSE
   AND approver.approver_type = 'USER'
   AND approver.approver_ref_id = 'a0000000-0000-0000-0000-000000000001'::uuid
   AND approver.is_deleted = FALSE;
