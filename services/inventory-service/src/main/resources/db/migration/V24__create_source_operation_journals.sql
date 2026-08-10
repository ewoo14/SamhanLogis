-- #1142 S1: 정방향 재고 mutation source journal.
-- JSONB 배열은 호출별 생성 집합을 한 행에 보존하여 라인별 journal 쓰기를 피한다.
CREATE TABLE source_operation_journals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_operation_id UUID NOT NULL UNIQUE,
    slip_id UUID,
    slip_revision BIGINT,
    product_snapshot JSONB NOT NULL,
    outcome VARCHAR(24) NOT NULL CHECK (outcome IN ('APPLIED', 'NO_OP_EXISTING', 'NO_OP_EXCLUDED')),
    created_lot_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_instance_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50) NOT NULL DEFAULT 'system',
    modified_at TIMESTAMP,
    modified_by VARCHAR(50),
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(50),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX ix_source_operation_journals_slip ON source_operation_journals (slip_id, slip_revision);
CREATE INDEX ix_source_operation_journals_outcome ON source_operation_journals (outcome);
