-- S3b: dispatch-group aggregate optimistic locking.
-- Existing rows start at zero; no destructive schema change.
ALTER TABLE dispatch_groups ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE carriers ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE dispatch_group_slips ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
