-- V67__add_accounting_audit_logs_active_revision_unique.sql
-- 다중 인스턴스 revision 채번의 DB 최종 안전망. batch 필드는 같은 revision을 공유하므로
-- field_name까지 키에 포함하고, soft-deleted audit 행은 재사용을 허용한다.

CREATE UNIQUE INDEX ux_accounting_audit_logs_entity_revision_field_active
    ON accounting_audit_logs (entity_id, revision_no, field_name)
    WHERE is_deleted = FALSE;
